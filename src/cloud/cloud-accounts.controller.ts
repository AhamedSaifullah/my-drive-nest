import { Controller, Delete, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../user/jwt-auth.guard';
import type { AuthenticatedRequest } from '../user/jwt-auth.guard';
import { CloudService } from './cloud.service';

@Controller('cloud/accounts')
export class CloudAccountsController {
	constructor(private readonly cloudService: CloudService) {}

	@Delete(':id')
	@UseGuards(JwtAuthGuard)
	unlink(
		@Param('id') accountId: string,
		@Req() request: AuthenticatedRequest,
	) {
		return this.cloudService.unlinkGoogleAccount(request.user.sub, accountId);
	}
}
