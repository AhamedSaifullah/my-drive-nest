import {
	Body,
	Controller,
	Get,
	Patch,
	Post,
	Req,
	UseGuards,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { AuthenticatedRequest } from './jwt-auth.guard';
import { TokenBlacklistService } from './token-blacklist.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserService } from './user.service';
import { Throttle } from '@nestjs/throttler';

@Controller('user')
export class UserController {
	constructor(
		private readonly userService: UserService,
		private readonly tokenBlacklistService: TokenBlacklistService,
	) {}

	@Post('create-user')
	@Throttle({ default: { limit: 5, ttl: 60_000, blockDuration: 60_000 } })
	createUser(@Body() createUserDto: CreateUserDto) {
		console.log('test from register');
		return this.userService.create(createUserDto);
	}

	@Post('login-user')
	@Throttle({ default: { limit: 5, ttl: 60_000, blockDuration: 60_000 } })
	loginUser(@Body() loginUserDto: LoginUserDto) {
		return this.userService.login(loginUserDto);
	}

	@Get('details')
	@UseGuards(JwtAuthGuard)
	details(@Req() request: AuthenticatedRequest) {
		console.log('test from details');
		return this.userService.details(request.user.sub);
	}

	@Patch('update-user')
	@UseGuards(JwtAuthGuard)
	updateUser(
		@Req() request: AuthenticatedRequest,
		@Body() updateUserDto: UpdateUserDto,
	) {
		return this.userService.update(request.user.sub, updateUserDto);
	}

	@Post('logout')
	@UseGuards(JwtAuthGuard)
	@Throttle({ default: { limit: 10, ttl: 60_000, blockDuration: 60_000 } })
	async logout(@Req() request: AuthenticatedRequest) {
		console.log('test from logout');
		this.tokenBlacklistService.revoke(request.authToken);
		await this.userService.revokeRefreshSessions(request.user.sub);
		return { message: 'logged out successfully' };
	}
}
