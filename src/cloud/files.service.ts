import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CloudFile, FileCategory, FileDocument } from './entities/file.schema';

const CATEGORIES: FileCategory[] = ['image', 'video', 'audio', 'document', 'other'];
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

type FileQuery = {
	category?: string;
	accountId?: string;
	page?: string;
	limit?: string;
	sort?: string;
	order?: string;
};

@Injectable()
export class FilesService {
	constructor(
		@InjectModel(CloudFile.name)
		private readonly fileModel: Model<FileDocument>,
	) {}

	async list(userId: string, query: FileQuery) {
		const filter = this.buildFilter(userId, query);
		const page = this.parsePositiveInt(query.page, 1, 'page');
		const limit = Math.min(this.parsePositiveInt(query.limit, DEFAULT_LIMIT, 'limit'), MAX_LIMIT);
		const direction = query.order === 'asc' ? 1 : -1;
		if (query.order && query.order !== 'asc' && query.order !== 'desc') {
			throw new BadRequestException('order must be asc or desc');
		}
		if (query.sort && query.sort !== 'modifiedAt' && query.sort !== 'name' && query.sort !== 'size') {
			throw new BadRequestException('sort must be modifiedAt, name, or size');
		}
		const sortField = query.sort ?? 'modifiedAt';
		const sort = { [sortField]: direction, _id: direction } as Record<string, 1 | -1>;

		const [items, total] = await Promise.all([
			this.fileModel.find(filter)
				.sort(sort)
				.skip((page - 1) * limit)
				.limit(limit)
				.lean()
				.exec(),
			this.fileModel.countDocuments(filter).exec(),
		]);

		return {
			items,
			pagination: {
				page,
				limit,
				total,
				totalPages: total === 0 ? 0 : Math.ceil(total / limit),
				hasNextPage: page * limit < total,
				hasPreviousPage: page > 1,
			},
		};
	}

	async summary(userId: string, accountId?: string) {
		const match: Record<string, unknown> = { userId: this.toObjectId(userId, 'user id') };
		if (accountId) match.cloudAccountId = this.toObjectId(accountId, 'account id');
		const rows = await this.fileModel.aggregate<{ _id: FileCategory; count: number; totalSize: number }>([
			{ $match: match },
			{
				$group: {
					_id: '$category',
					count: { $sum: 1 },
					totalSize: { $sum: { $ifNull: ['$size', 0] } },
				},
			},
		]).exec();

		const categories = Object.fromEntries(CATEGORIES.map((category) => [category, { count: 0, totalSize: 0 }])) as Record<FileCategory, { count: number; totalSize: number }>;
		for (const row of rows) categories[row._id] = { count: row.count, totalSize: row.totalSize };
		const totalFiles = Object.values(categories).reduce((sum, value) => sum + value.count, 0);
		const totalSize = Object.values(categories).reduce((sum, value) => sum + value.totalSize, 0);
		return { totalFiles, totalSize, categories };
	}

	private buildFilter(userId: string, query: FileQuery) {
		const filter: Record<string, unknown> = { userId: this.toObjectId(userId, 'user id') };
		if (query.category) {
			if (!CATEGORIES.includes(query.category as FileCategory)) {
				throw new BadRequestException(`category must be one of: ${CATEGORIES.join(', ')}`);
			}
			filter.category = query.category;
		}
		if (query.accountId) filter.cloudAccountId = this.toObjectId(query.accountId, 'account id');
		return filter;
	}

	private parsePositiveInt(value: string | undefined, fallback: number, name: string) {
		if (value === undefined) return fallback;
		const parsed = Number(value);
		if (!Number.isInteger(parsed) || parsed < 1) throw new BadRequestException(`${name} must be a positive integer`);
		return parsed;
	}

	private toObjectId(value: string, name: string) {
		if (!Types.ObjectId.isValid(value)) throw new BadRequestException(`Invalid ${name}`);
		return new Types.ObjectId(value);
	}
}
