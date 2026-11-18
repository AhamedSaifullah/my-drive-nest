import { Types } from 'mongoose';
import { InitialSyncService } from './initial-sync.service';

describe('InitialSyncService', () => {
	it('bulk upserts normalized files and records completion', async () => {
		const accountId = new Types.ObjectId();
		const syncJobId = new Types.ObjectId();
		const updateOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) });
		const fileModel = {
			bulkWrite: jest.fn().mockResolvedValue({ upsertedCount: 2, modifiedCount: 0 }),
		};
		const accountModel = {
			findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ _id: accountId }) }),
			updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
		};
		const syncJobModel = { updateOne };
		const cloudService = {
			getGoogleAccessToken: jest.fn().mockResolvedValue('access-token'),
		};
		async function* files() {
			yield { providerFileId: 'file-1', name: 'photo.jpg', category: 'image' as const };
			yield { providerFileId: 'file-2', name: 'notes.pdf', category: 'document' as const };
		}
		const googleProvider = {
			listAllFiles: jest.fn().mockReturnValue(files()),
			getStartPageToken: jest.fn().mockResolvedValue('cursor-1'),
		};
		const service = new InitialSyncService(
			accountModel as never,
			fileModel as never,
			syncJobModel as never,
			cloudService as never,
			googleProvider as never,
		);

		await expect(service.run({
			userId: new Types.ObjectId().toString(),
			accountId: accountId.toString(),
			syncJobId: syncJobId.toString(),
		})).resolves.toEqual({ processedCount: 2, createdCount: 2, updatedCount: 0 });

		expect(fileModel.bulkWrite).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({
					updateOne: expect.objectContaining({
						filter: { cloudAccountId: accountId, providerFileId: 'file-1' },
						upsert: true,
					}),
				}),
			]),
			expect.objectContaining({ ordered: false }),
		);
		expect(updateOne).toHaveBeenCalledWith(
			expect.objectContaining({ _id: syncJobId }),
			expect.objectContaining({ $set: expect.objectContaining({ status: 'completed' }) }),
		);
	});

	it('applies incremental changes and advances the stored cursor', async () => {
		const accountId = new Types.ObjectId();
		const syncJobId = new Types.ObjectId();
		const updateOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) });
		const accountModel = {
			findOne: jest.fn().mockReturnValue({
				exec: jest.fn().mockResolvedValue({ _id: accountId, changesCursor: 'cursor-1' }),
			}),
			updateOne,
		};
		const fileModel = {
			bulkWrite: jest.fn().mockResolvedValue({ upsertedCount: 1, modifiedCount: 0 }),
		};
		const syncJobModel = { updateOne };
		const cloudService = { getGoogleAccessToken: jest.fn().mockResolvedValue('access-token') };
		const googleProvider = {
			listChanges: jest.fn().mockResolvedValue({
				changes: [
					{ providerFileId: 'file-1', removed: true },
					{ providerFileId: 'file-3', removed: false, file: { providerFileId: 'file-3', name: 'trashed.pdf', category: 'document', trashed: true } },
					{ providerFileId: 'file-2', removed: false, file: { providerFileId: 'file-2', name: 'moved.pdf', category: 'document', parentId: 'new-folder' } },
				],
				newStartPageToken: 'cursor-2',
			}),
		};
		const service = new InitialSyncService(
			accountModel as never,
			fileModel as never,
			syncJobModel as never,
			cloudService as never,
			googleProvider as never,
			{} as never,
		);

		await expect(service.runIncremental({
			userId: new Types.ObjectId().toString(),
			accountId: accountId.toString(),
			syncJobId: syncJobId.toString(),
		})).resolves.toEqual({ processedCount: 3, createdCount: 1, updatedCount: 0, deletedCount: 2 });

		expect(fileModel.bulkWrite).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({ deleteOne: expect.any(Object) }),
			expect.objectContaining({
				updateOne: expect.objectContaining({
					update: { $set: expect.objectContaining({ parentId: 'new-folder' }) },
				}),
			}),
			]),
			expect.objectContaining({ ordered: false }),
		);
		expect(accountModel.updateOne).toHaveBeenCalledWith(
			expect.objectContaining({ _id: accountId }),
			{ $set: { changesCursor: 'cursor-2' } },
		);
	});

	it('enqueues manual sync once per cooldown window', async () => {
		const userId = new Types.ObjectId();
		const accountId = new Types.ObjectId();
		const firstJobId = new Types.ObjectId();
		const account = { _id: accountId, changesCursor: 'cursor-1' };
		const accountModel = {
			findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(account) }),
			findOneAndUpdate: jest.fn()
				.mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(account) })
				.mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(null) }),
		};
		const syncJobModel = {
			create: jest.fn().mockResolvedValue({ _id: firstJobId }),
			updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
		};
		const syncQueue = {
			enqueueIncrementalSync: jest.fn().mockResolvedValue({ queueJobId: 'queue-job-1' }),
		};
		const service = new InitialSyncService(
			accountModel as never,
			{} as never,
			syncJobModel as never,
			{} as never,
			{} as never,
			syncQueue as never,
		);

		await expect(service.enqueueIncremental(userId.toString(), accountId.toString())).resolves.toEqual({
			syncJobId: firstJobId.toString(),
			queueJobId: 'queue-job-1',
		});
		await expect(service.enqueueIncremental(userId.toString(), accountId.toString())).rejects.toThrow(
			'Sync was requested recently',
		);
		expect(syncQueue.enqueueIncrementalSync).toHaveBeenCalledTimes(1);
	});

	it('returns the latest sync status and counts for an account', async () => {
		const userId = new Types.ObjectId();
		const accountId = new Types.ObjectId();
		const jobId = new Types.ObjectId();
		const accountQuery = {
			select: jest.fn().mockReturnThis(),
			lean: jest.fn().mockReturnThis(),
			exec: jest.fn().mockResolvedValue({ _id: accountId }),
		};
		const jobQuery = {
			sort: jest.fn().mockReturnThis(),
			lean: jest.fn().mockReturnThis(),
			exec: jest.fn().mockResolvedValue({
				_id: jobId,
				type: 'incremental',
				status: 'completed',
				processedCount: 4,
				createdCount: 1,
				updatedCount: 2,
				deletedCount: 1,
			}),
		};
		const accountModel = { findOne: jest.fn().mockReturnValue(accountQuery) };
		const syncJobModel = { findOne: jest.fn().mockReturnValue(jobQuery) };
		const service = new InitialSyncService(
			accountModel as never,
			{} as never,
			syncJobModel as never,
			{} as never,
			{} as never,
			{} as never,
		);

		await expect(service.getStatus(userId.toString(), accountId.toString())).resolves.toEqual({
			accountId: accountId.toString(),
			jobId: jobId.toString(),
			type: 'incremental',
			status: 'completed',
			processedCount: 4,
			createdCount: 1,
			updatedCount: 2,
			deletedCount: 1,
		});
		expect(jobQuery.sort).toHaveBeenCalledWith({ createdAt: -1 });
	});
});
