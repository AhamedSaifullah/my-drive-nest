import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CloudAccount, CloudAccountDocument } from './entities/cloud-account.schema';
import { CloudFile, FileDocument } from './entities/file.schema';
import { SyncJob, SyncJobDocument } from './entities/sync-job.schema';
import { GoogleProvider } from './providers/google.provider';
import { InitialSyncJobData } from '../queue/sync-queue.service';
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
	) {}

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

	private async writeBatch(batch: Parameters<Model<CloudFileDocument>['bulkWrite']>[0]) {
		const result = await this.fileModel.bulkWrite(batch, { ordered: false });
		return {
			processed: batch.length,
			created: result.upsertedCount,
			updated: result.modifiedCount,
		};
	}

	private updateProgress(syncJobId: Types.ObjectId, processedCount: number, createdCount: number, updatedCount: number) {
		return this.syncJobModel.updateOne({ _id: syncJobId }, { $set: { processedCount, createdCount, updatedCount } }).exec();
	}

	private safeError(cause: unknown) {
		return cause instanceof Error ? cause.name : 'UnknownError';
	}
}

type CloudFileDocument = CloudFile;
