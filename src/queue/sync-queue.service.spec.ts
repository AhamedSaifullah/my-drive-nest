import { SyncQueueService } from './sync-queue.service';

describe('sync queue', () => {
	it('enqueues a test sync job', async () => {
		const queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
		const service = new SyncQueueService(queue as never);

		await expect(service.enqueueTestJob('user-1')).resolves.toEqual({
			jobId: 'job-1',
			queue: 'cloud-sync',
			jobName: 'test-sync',
		});
		expect(queue.add).toHaveBeenCalledWith(
			'test-sync',
			expect.objectContaining({ userId: 'user-1' }),
		);
	});

});
