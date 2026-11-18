import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { INITIAL_SYNC_JOB, SYNC_QUEUE, TEST_SYNC_JOB } from './queue.constants';
import { InitialSyncJobData, TestSyncJobData } from './sync-queue.service';
import { InitialSyncService } from '../cloud/initial-sync.service';

@Injectable()
@Processor(SYNC_QUEUE)
export class SyncProcessor extends WorkerHost {
	private readonly logger = new Logger(SyncProcessor.name);

	constructor(private readonly initialSync: InitialSyncService) {
		super();
	}

	async process(job: Job<TestSyncJobData | InitialSyncJobData>) {
		if (job.name === INITIAL_SYNC_JOB) {
			return this.initialSync.run(job.data as InitialSyncJobData);
		}
		if (job.name === TEST_SYNC_JOB) {
			this.logger.log(JSON.stringify({
				event: 'cloud.sync.test_job_processed',
				jobId: job.id,
				userId: (job.data as TestSyncJobData).userId,
			}));
			return { processed: true, jobId: job.id };
		}
		throw new Error(`Unsupported sync job: ${job.name}`);
	}
}
