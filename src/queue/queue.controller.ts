import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../user/jwt-auth.guard';
import type { AuthenticatedRequest } from '../user/jwt-auth.guard';
import { SyncQueueService } from './sync-queue.service';

@Controller('cloud/sync')
export class QueueController {
	constructor(private readonly syncQueue: SyncQueueService) {}

	@Post('test')
	@UseGuards(JwtAuthGuard)
	enqueueTestJob(@Req() request: AuthenticatedRequest) {
		return this.syncQueue.enqueueTestJob(request.user.sub);
	}
}
