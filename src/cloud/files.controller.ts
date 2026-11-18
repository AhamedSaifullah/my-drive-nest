import { Controller, Get, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../user/jwt-auth.guard';
import type { AuthenticatedRequest } from '../user/jwt-auth.guard';
import { FilesService } from './files.service';

@Controller('files')
@UseGuards(JwtAuthGuard)
export class FilesController {
	constructor(private readonly filesService: FilesService) {}

	@Get()
	list(@Req() request: AuthenticatedRequest, @Query() query: Record<string, string | undefined>) {
		return this.filesService.list(request.user.sub, query);
	}

	@Get('summary')
	summary(
		@Req() request: AuthenticatedRequest,
		@Query('accountId') accountId?: string,
	) {
		return this.filesService.summary(request.user.sub, accountId);
	}

	@Get('search')
	search(@Req() request: AuthenticatedRequest, @Query() query: Record<string, string | undefined>) {
		return this.filesService.search(request.user.sub, query);
	}

	@Get(':id')
	getById(
		@Param('id') fileId: string,
		@Req() request: AuthenticatedRequest,
	) {
		return this.filesService.getById(request.user.sub, fileId);
	}

	@Get(':id/thumbnail')
	async thumbnail(
		@Param('id') fileId: string,
		@Req() request: AuthenticatedRequest,
		@Res() response: Response,
	) {
		const thumbnail = await this.filesService.getThumbnail(request.user.sub, fileId);
		return response
			.type(thumbnail.contentType)
			.set('Cache-Control', 'private, max-age=60')
			.send(thumbnail.body);
	}
}
