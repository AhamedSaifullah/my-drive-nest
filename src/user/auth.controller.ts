import { Body, Controller, Post } from '@nestjs/common';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UserService } from './user.service';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
	constructor(private readonly userService: UserService) {}

	@Post('refresh')
	@Throttle({ default: { limit: 10, ttl: 60_000, blockDuration: 60_000 } })
	refresh(@Body() refreshTokenDto: RefreshTokenDto) {
		return this.userService.refreshAccessToken(refreshTokenDto.refresh_token);
	}
}
