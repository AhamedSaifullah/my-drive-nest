import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
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
}
