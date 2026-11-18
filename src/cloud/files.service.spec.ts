import { Types } from 'mongoose';
import { FilesService } from './files.service';

describe('FilesService', () => {
	it('lists a user\'s files with filters, stable sorting, and pagination', async () => {
		const userId = new Types.ObjectId();
		const accountId = new Types.ObjectId();
		const findQuery = {
			sort: jest.fn().mockReturnThis(),
			skip: jest.fn().mockReturnThis(),
			limit: jest.fn().mockReturnThis(),
			lean: jest.fn().mockReturnThis(),
			exec: jest.fn().mockResolvedValue([{ name: 'photo.jpg' }]),
		};
		const fileModel = {
			find: jest.fn().mockReturnValue(findQuery),
			countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(21) }),
		};
		const service = new FilesService(fileModel as never);

		await expect(service.list(userId.toString(), {
			category: 'image',
			accountId: accountId.toString(),
			page: '2',
			limit: '10',
			order: 'asc',
		})).resolves.toMatchObject({
			items: [{ name: 'photo.jpg' }],
			pagination: { page: 2, limit: 10, total: 21, totalPages: 3, hasNextPage: true },
		});
		expect(fileModel.find).toHaveBeenCalledWith({
			userId,
			category: 'image',
			cloudAccountId: accountId,
		});
		expect(findQuery.sort).toHaveBeenCalledWith({ modifiedAt: 1, _id: 1 });
		expect(findQuery.skip).toHaveBeenCalledWith(10);
		expect(findQuery.limit).toHaveBeenCalledWith(10);
	});

	it('returns totals by category and total size', async () => {
		const userId = new Types.ObjectId();
		const aggregate = jest.fn().mockReturnValue({
			exec: jest.fn().mockResolvedValue([
				{ _id: 'image', count: 2, totalSize: 500 },
				{ _id: 'document', count: 1, totalSize: 1000 },
			]),
		});
		const fileModel = { aggregate };
		const service = new FilesService(fileModel as never);

		await expect(service.summary(userId.toString())).resolves.toMatchObject({
			totalFiles: 3,
			totalSize: 1500,
			categories: {
				image: { count: 2, totalSize: 500 },
				document: { count: 1, totalSize: 1000 },
				video: { count: 0, totalSize: 0 },
			},
		});
		expect(aggregate).toHaveBeenCalledWith(expect.arrayContaining([
			expect.objectContaining({ $match: { userId } }),
		]));
	});
});
