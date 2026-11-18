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
		};
		const syncJobModel = { updateOne };
		const cloudService = {
			getGoogleAccessToken: jest.fn().mockResolvedValue('access-token'),
		};
		async function* files() {
			yield { providerFileId: 'file-1', name: 'photo.jpg', category: 'image' as const };
			yield { providerFileId: 'file-2', name: 'notes.pdf', category: 'document' as const };
		}
		const googleProvider = { listAllFiles: jest.fn().mockReturnValue(files()) };
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
});
