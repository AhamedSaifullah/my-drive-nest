import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../user/jwt-auth.guard';
import type { AuthenticatedRequest } from '../user/jwt-auth.guard';
import { InitialSyncService } from './initial-sync.service';

@Controller('cloud/sync')
export class SyncController {
	constructor(private readonly initialSync: InitialSyncService) {}

	@Post('incremental/:accountId')
	@UseGuards(JwtAuthGuard)
	enqueueIncremental(
		@Param('accountId') accountId: string,
		@Req() request: AuthenticatedRequest,
	) {
		return this.initialSync.enqueueIncremental(request.user.sub, accountId);
	}
}
