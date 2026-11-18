import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CloudAccount, CloudAccountDocument } from './entities/cloud-account.schema';
import { InitialSyncService } from './initial-sync.service';

@Injectable()
export class SyncScheduler {
	private readonly logger = new Logger(SyncScheduler.name);

	constructor(
		@InjectModel(CloudAccount.name)
		private readonly accountModel: Model<CloudAccountDocument>,
		private readonly initialSync: InitialSyncService,
	) {}

	@Cron('0 */15 * * * *')
	async scheduleIncrementalSyncs() {
		const accounts = await this.accountModel.find({
			status: 'active',
			changesCursor: { $exists: true, $ne: '' },
		}).select('userId').lean().exec();

		for (const account of accounts) {
			try {
				await this.initialSync.enqueueIncremental(account.userId.toString(), account._id.toString());
			} catch (cause) {
				this.logger.debug(JSON.stringify({
					event: 'cloud.sync.schedule_skipped',
					accountId: account._id.toString(),
					reason: cause instanceof Error ? cause.name : 'UnknownError',
				}));
			}
		}
	}
}
