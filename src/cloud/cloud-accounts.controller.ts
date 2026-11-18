import { Controller, Delete, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../user/jwt-auth.guard';
import type { AuthenticatedRequest } from '../user/jwt-auth.guard';
import { CloudService } from './cloud.service';
import { InitialSyncService } from './initial-sync.service';

@Controller('cloud/accounts')
export class CloudAccountsController {
	constructor(
		private readonly cloudService: CloudService,
		private readonly initialSync: InitialSyncService,
	) {}

	@Post(':id/sync')
	@UseGuards(JwtAuthGuard)
	requestSync(
		@Param('id') accountId: string,
		@Req() request: AuthenticatedRequest,
	) {
		return this.initialSync.enqueueIncremental(request.user.sub, accountId);
	}

	@Delete(':id')
	@UseGuards(JwtAuthGuard)
	unlink(
		@Param('id') accountId: string,
		@Req() request: AuthenticatedRequest,
	) {
		return this.cloudService.unlinkGoogleAccount(request.user.sub, accountId);
	}
}
