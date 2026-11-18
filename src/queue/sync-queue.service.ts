import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { INITIAL_SYNC_JOB, SYNC_QUEUE, TEST_SYNC_JOB } from './queue.constants';

export type TestSyncJobData = {
	userId: string;
	requestedAt: string;
};

export type InitialSyncJobData = {
	userId: string;
	accountId: string;
	syncJobId: string;
};

@Injectable()
export class SyncQueueService {
	constructor(@InjectQueue(SYNC_QUEUE) private readonly queue: Queue) {}

	async enqueueTestJob(userId: string) {
		const job = await this.queue.add(TEST_SYNC_JOB, {
			userId,
			requestedAt: new Date().toISOString(),
		} satisfies TestSyncJobData);
		return { jobId: job.id, queue: SYNC_QUEUE, jobName: TEST_SYNC_JOB };
	}

	async enqueueInitialSync(data: InitialSyncJobData) {
		const job = await this.queue.add(INITIAL_SYNC_JOB, data);
		return { queueJobId: job.id, queue: SYNC_QUEUE, jobName: INITIAL_SYNC_JOB };
	}
}
