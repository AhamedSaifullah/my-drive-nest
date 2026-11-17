import { Body, Controller, Post } from '@nestjs/common';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UserService } from './user.service';

@Controller('auth')
export class AuthController {
	constructor(private readonly userService: UserService) {}

	@Post('refresh')
	refresh(@Body() refreshTokenDto: RefreshTokenDto) {
		return this.userService.refreshAccessToken(refreshTokenDto.refresh_token);
	}
}
