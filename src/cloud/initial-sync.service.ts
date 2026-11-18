import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CloudAccount, CloudAccountDocument } from './entities/cloud-account.schema';
import { CloudFile, FileDocument } from './entities/file.schema';
import { SyncJob, SyncJobDocument } from './entities/sync-job.schema';
import { GoogleProvider } from './providers/google.provider';
import { IncrementalSyncJobData, InitialSyncJobData } from '../queue/sync-queue.service';
import { SyncQueueService } from '../queue/sync-queue.service';
import { CloudService } from './cloud.service';

const BULK_BATCH_SIZE = 500;

@Injectable()
export class InitialSyncService {
	private readonly logger = new Logger(InitialSyncService.name);

	constructor(
		@InjectModel(CloudAccount.name)
		private readonly accountModel: Model<CloudAccountDocument>,
		@InjectModel(CloudFile.name)
		private readonly fileModel: Model<FileDocument>,
		@InjectModel(SyncJob.name)
		private readonly syncJobModel: Model<SyncJobDocument>,
		private readonly cloudService: CloudService,
		private readonly googleProvider: GoogleProvider,
		private readonly syncQueue: SyncQueueService,
	) {}

	async enqueueIncremental(userId: string, accountId: string) {
		const account = await this.accountModel.findOne({
			_id: new Types.ObjectId(accountId),
			userId: new Types.ObjectId(userId),
			provider: 'google',
			status: 'active',
		}).exec();
		if (!account) throw new Error('Google account is not active');
		if (!account.changesCursor) throw new Error('Initial Google sync has not completed');
		const syncJob = await this.syncJobModel.create({
			cloudAccountId: account._id,
			type: 'incremental',
			status: 'queued',
		});
		try {
			const queueJob = await this.syncQueue.enqueueIncrementalSync({
				userId,
				accountId,
				syncJobId: syncJob._id.toString(),
			});
			return { syncJobId: syncJob._id.toString(), ...queueJob };
		} catch (cause) {
			await this.syncJobModel.updateOne(
				{ _id: syncJob._id },
				{ $set: { status: 'failed', error: this.safeError(cause), completedAt: new Date() } },
			).exec();
			throw cause;
		}
	}

	async run(data: InitialSyncJobData) {
		const syncJobId = new Types.ObjectId(data.syncJobId);
		const accountId = new Types.ObjectId(data.accountId);
		await this.syncJobModel.updateOne(
			{ _id: syncJobId, cloudAccountId: accountId },
			{
				$set: {
					status: 'running',
					startedAt: new Date(),
					processedCount: 0,
					createdCount: 0,
					updatedCount: 0,
					deletedCount: 0,
				},
				$unset: { completedAt: 1, error: 1 },
			},
		).exec();

		let processedCount = 0;
		let createdCount = 0;
		let updatedCount = 0;
		try {
			const account = await this.accountModel.findOne({
				_id: accountId,
				userId: new Types.ObjectId(data.userId),
				provider: 'google',
				status: 'active',
			}).exec();
			if (!account) throw new Error('Google account is not active');
			const accessToken = await this.cloudService.getGoogleAccessToken(data.userId, data.accountId);
			const changesCursor = await this.googleProvider.getStartPageToken(accessToken);
			let batch: Parameters<Model<CloudFileDocument>['bulkWrite']>[0] = [];

			for await (const file of this.googleProvider.listAllFiles(accessToken)) {
				if (file.trashed) continue;
				batch.push({
					updateOne: {
						filter: { cloudAccountId: accountId, providerFileId: file.providerFileId },
						update: {
							$set: {
								userId: new Types.ObjectId(data.userId),
								cloudAccountId: accountId,
								providerFileId: file.providerFileId,
								name: file.name,
								mimeType: file.mimeType,
								category: file.category,
								size: file.size,
								modifiedAt: file.modifiedAt,
								thumbnailUrl: file.thumbnailUrl,
								parentId: file.parentId,
							},
						},
						upsert: true,
					},
				});
				if (batch.length >= BULK_BATCH_SIZE) {
					const counts = await this.writeBatch(batch);
					processedCount += counts.processed;
					createdCount += counts.created;
					updatedCount += counts.updated;
					batch = [];
					await this.updateProgress(syncJobId, processedCount, createdCount, updatedCount);
				}
			}
			if (batch.length > 0) {
				const counts = await this.writeBatch(batch);
				processedCount += counts.processed;
				createdCount += counts.created;
				updatedCount += counts.updated;
			}
			await this.syncJobModel.updateOne(
				{ _id: syncJobId },
				{ $set: { status: 'completed', processedCount, createdCount, updatedCount, completedAt: new Date() } },
			).exec();
			await this.accountModel.updateOne(
				{ _id: accountId, userId: new Types.ObjectId(data.userId) },
				{ $set: { changesCursor } },
			).exec();
			return { processedCount, createdCount, updatedCount };
		} catch (cause) {
			await this.syncJobModel.updateOne(
				{ _id: syncJobId },
				{ $set: { status: 'failed', processedCount, createdCount, updatedCount, error: this.safeError(cause), completedAt: new Date() } },
			).exec();
			this.logger.error(JSON.stringify({ event: 'cloud.sync.initial_failed', syncJobId: data.syncJobId, error: this.safeError(cause) }));
			throw cause;
		}
	}

	async runIncremental(data: IncrementalSyncJobData) {
		const syncJobId = new Types.ObjectId(data.syncJobId);
		const accountId = new Types.ObjectId(data.accountId);
		await this.syncJobModel.updateOne(
			{ _id: syncJobId, cloudAccountId: accountId },
			{
				$set: {
					status: 'running',
					startedAt: new Date(),
					processedCount: 0,
					createdCount: 0,
					updatedCount: 0,
					deletedCount: 0,
				},
				$unset: { completedAt: 1, error: 1 },
			},
		).exec();

		let processedCount = 0;
		let createdCount = 0;
		let updatedCount = 0;
		let deletedCount = 0;
		try {
			const account = await this.accountModel.findOne({
				_id: accountId,
				userId: new Types.ObjectId(data.userId),
				provider: 'google',
				status: 'active',
			}).exec();
			if (!account?.changesCursor) throw new Error('Initial Google sync has not completed');
			const accessToken = await this.cloudService.getGoogleAccessToken(data.userId, data.accountId);
			let pageToken = account.changesCursor;
			let latestCursor = pageToken;
			do {
				const page = await this.googleProvider.listChanges(accessToken, pageToken);
				const batch: Parameters<Model<CloudFileDocument>['bulkWrite']>[0] = [];
				for (const change of page.changes) {
					processedCount += 1;
					if (change.removed || !change.file || change.file.trashed) {
						batch.push({ deleteOne: { filter: { cloudAccountId: accountId, providerFileId: change.providerFileId } } });
						deletedCount += 1;
						continue;
					}
					batch.push({
						updateOne: {
							filter: { cloudAccountId: accountId, providerFileId: change.providerFileId },
							update: { $set: {
								userId: new Types.ObjectId(data.userId), cloudAccountId: accountId,
								providerFileId: change.file.providerFileId, name: change.file.name,
								mimeType: change.file.mimeType, category: change.file.category,
								size: change.file.size, modifiedAt: change.file.modifiedAt,
								thumbnailUrl: change.file.thumbnailUrl, parentId: change.file.parentId,
							} },
							upsert: true,
						},
					});
				}
				if (batch.length > 0) {
					const result = await this.fileModel.bulkWrite(batch, { ordered: false });
					createdCount += result.upsertedCount;
					updatedCount += result.modifiedCount;
				}
				pageToken = page.nextPageToken ?? '';
				latestCursor = page.newStartPageToken ?? latestCursor;
				await this.updateProgress(syncJobId, processedCount, createdCount, updatedCount, deletedCount);
			} while (pageToken);

			await this.accountModel.updateOne({ _id: accountId }, { $set: { changesCursor: latestCursor } }).exec();
			await this.syncJobModel.updateOne(
				{ _id: syncJobId },
				{ $set: { status: 'completed', processedCount, createdCount, updatedCount, deletedCount, completedAt: new Date() } },
			).exec();
			return { processedCount, createdCount, updatedCount, deletedCount };
		} catch (cause) {
			await this.syncJobModel.updateOne(
				{ _id: syncJobId },
				{ $set: { status: 'failed', processedCount, createdCount, updatedCount, deletedCount, error: this.safeError(cause), completedAt: new Date() } },
			).exec();
			this.logger.error(JSON.stringify({ event: 'cloud.sync.incremental_failed', syncJobId: data.syncJobId, error: this.safeError(cause) }));
			throw cause;
		}
	}

	private async writeBatch(batch: Parameters<Model<CloudFileDocument>['bulkWrite']>[0]) {
		const result = await this.fileModel.bulkWrite(batch, { ordered: false });
		return {
			processed: batch.length,
			created: result.upsertedCount,
			updated: result.modifiedCount,
		};
	}

	private updateProgress(syncJobId: Types.ObjectId, processedCount: number, createdCount: number, updatedCount: number, deletedCount = 0) {
		return this.syncJobModel.updateOne({ _id: syncJobId }, { $set: { processedCount, createdCount, updatedCount, deletedCount } }).exec();
	}

	private safeError(cause: unknown) {
		return cause instanceof Error ? cause.name : 'UnknownError';
	}
}

type CloudFileDocument = CloudFile;
