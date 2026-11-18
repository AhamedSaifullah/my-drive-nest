import { Controller, Get, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Readable } from 'node:stream';
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

	@Get(':id/content')
	async content(
		@Param('id') fileId: string,
		@Req() request: AuthenticatedRequest,
		@Res() response: Response,
	) {
		const upstream = await this.filesService.getContent(
			request.user.sub,
			fileId,
			request.headers.range,
		);
		response.status(upstream.status);
		for (const header of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag']) {
			const value = upstream.headers.get(header);
			if (value) response.setHeader(header, value);
		}
		if (!upstream.body) return response.end();
		return Readable.fromWeb(upstream.body as never).pipe(response);
	}
}
