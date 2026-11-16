import { Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../user/jwt-auth.guard';
import type { AuthenticatedRequest } from '../user/jwt-auth.guard';
import { CloudService } from './cloud.service';

@Controller('cloud/google')
export class CloudController {
	constructor(private readonly cloudService: CloudService) {}

	@Post('link')
	@UseGuards(JwtAuthGuard)
	link(@Req() request: AuthenticatedRequest) {
		return this.cloudService.createGoogleAuthorizationUrl(request.user.sub);
	}

	@Get('callback')
	async callback(
		@Query('code') code: string | undefined,
		@Query('state') state: string | undefined,
		@Query('error') error: string | undefined,
		@Res({ passthrough: true }) response: Response,
	) {
		return this.cloudService.handleGoogleCallback(code, state, error, response);
	}

	@Get('accounts')
	@UseGuards(JwtAuthGuard)
	accounts(@Req() request: AuthenticatedRequest) {
		return this.cloudService.listAccounts(request.user.sub);
	}

	@Post('unlink')
	@UseGuards(JwtAuthGuard)
	unlink(@Req() request: AuthenticatedRequest) {
		return this.cloudService.unlinkGoogle(request.user.sub);
	}
}
