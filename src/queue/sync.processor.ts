import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { SYNC_QUEUE, TEST_SYNC_JOB } from './queue.constants';
import { TestSyncJobData } from './sync-queue.service';

@Injectable()
@Processor(SYNC_QUEUE)
export class SyncProcessor extends WorkerHost {
	private readonly logger = new Logger(SyncProcessor.name);

	async process(job: Job<TestSyncJobData>) {
		if (job.name !== TEST_SYNC_JOB) {
			throw new Error(`Unsupported sync job: ${job.name}`);
		}

		this.logger.log(JSON.stringify({
			event: 'cloud.sync.test_job_processed',
			jobId: job.id,
			userId: job.data.userId,
		}));
		return { processed: true, jobId: job.id };
	}
}
