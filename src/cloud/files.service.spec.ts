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
		const service = new FilesService(fileModel as never, {} as never, {} as never);

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
		const service = new FilesService(fileModel as never, {} as never, {} as never);

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

	it('returns metadata only when the file belongs to the user', async () => {
		const userId = new Types.ObjectId();
		const fileId = new Types.ObjectId();
		const fileQuery = {
			lean: jest.fn().mockReturnThis(),
			exec: jest.fn().mockResolvedValue({ _id: fileId, userId, name: 'photo.jpg', category: 'image' }),
		};
		const fileModel = { findOne: jest.fn().mockReturnValue(fileQuery) };
		const service = new FilesService(fileModel as never, {} as never, {} as never);

		await expect(service.getById(userId.toString(), fileId.toString())).resolves.toEqual({
			_id: fileId,
			userId,
			name: 'photo.jpg',
			category: 'image',
		});
		expect(fileModel.findOne).toHaveBeenCalledWith({ _id: fileId, userId });
	});

	it('searches names using the text index and returns pagination', async () => {
		const userId = new Types.ObjectId();
		const findQuery = {
			sort: jest.fn().mockReturnThis(),
			skip: jest.fn().mockReturnThis(),
			limit: jest.fn().mockReturnThis(),
			lean: jest.fn().mockReturnThis(),
			exec: jest.fn().mockResolvedValue([{ name: 'holiday-photo.jpg' }]),
		};
		const fileModel = {
			find: jest.fn().mockReturnValue(findQuery),
			countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(1) }),
		};
		const service = new FilesService(fileModel as never, {} as never, {} as never);

		await expect(service.search(userId.toString(), { q: 'holiday', page: '1', limit: '10' })).resolves.toMatchObject({
			items: [{ name: 'holiday-photo.jpg' }],
			pagination: { total: 1, totalPages: 1 },
		});
		expect(fileModel.find).toHaveBeenCalledWith({ userId, $text: { $search: 'holiday' } });
		expect(findQuery.sort).toHaveBeenCalledWith({ score: { $meta: 'textScore' }, modifiedAt: -1, _id: -1 });
	});

	it('fetches and caches a Google thumbnail briefly', async () => {
		const userId = new Types.ObjectId();
		const fileId = new Types.ObjectId();
		const fileQuery = {
			lean: jest.fn().mockReturnThis(),
			exec: jest.fn().mockResolvedValue({
				_id: fileId,
				userId,
				cloudAccountId: new Types.ObjectId(),
				thumbnailUrl: 'https://drive.google.com/thumbnail',
			}),
		};
		const fileModel = { findOne: jest.fn().mockReturnValue(fileQuery) };
		const cloudService = { getGoogleAccessToken: jest.fn().mockResolvedValue('access-token') };
		const googleProvider = {
			fetchThumbnail: jest.fn().mockResolvedValue({ body: Buffer.from('image'), contentType: 'image/jpeg' }),
		};
		const service = new FilesService(fileModel as never, cloudService as never, googleProvider as never);

		await expect(service.getThumbnail(userId.toString(), fileId.toString())).resolves.toMatchObject({ contentType: 'image/jpeg' });
		await expect(service.getThumbnail(userId.toString(), fileId.toString())).resolves.toMatchObject({ contentType: 'image/jpeg' });
		expect(googleProvider.fetchThumbnail).toHaveBeenCalledTimes(1);
	});
});
