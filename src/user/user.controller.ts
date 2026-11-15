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

@Controller('user')
export class UserController {
	constructor(
		private readonly userService: UserService,
		private readonly tokenBlacklistService: TokenBlacklistService,
	) {}

	@Post('create-user')
	createUser(@Body() createUserDto: CreateUserDto) {
		console.log('test from register');
		return this.userService.create(createUserDto);
	}

	@Post('login-user')
	loginUser(@Body() loginUserDto: LoginUserDto) {
		return this.userService.login(loginUserDto);
	}

	@Get('details')
	@UseGuards(JwtAuthGuard)
	details(@Req() request: AuthenticatedRequest) {
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
	logout(@Req() request: AuthenticatedRequest) {
		this.tokenBlacklistService.revoke(request.authToken);
		return { message: 'logged out successfully' };
	}
}
