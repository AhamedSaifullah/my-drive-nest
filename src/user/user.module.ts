import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { UserController } from './user.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { User, UserSchema } from './schemas/user.schema';
import { UserService } from './user.service';
import { TokenBlacklistService } from './token-blacklist.service';
import { RefreshSession, RefreshSessionSchema } from './schemas/refresh-session.schema';
import { AuthController } from './auth.controller';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: User.name, schema: UserSchema },
			{ name: RefreshSession.name, schema: RefreshSessionSchema },
		]),
		JwtModule.registerAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => {
				const secret = configService.get<string>('JWT_SECRET');
				if (!secret) {
					throw new Error('JWT_SECRET is required. Add it to .env');
				}
				return { secret };
			},
		}),
	],
	controllers: [UserController, AuthController],
	providers: [UserService, JwtAuthGuard, TokenBlacklistService],
	exports: [JwtAuthGuard, JwtModule, TokenBlacklistService],
})
export class UserModule {}
