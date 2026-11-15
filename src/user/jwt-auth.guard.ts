import {
	CanActivate,
	ExecutionContext,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { TokenBlacklistService } from './token-blacklist.service';

export type AuthenticatedRequest = Request & {
	user: { sub: string };
	authToken: string;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
	constructor(
		private readonly jwtService: JwtService,
		private readonly tokenBlacklistService: TokenBlacklistService,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context
			.switchToHttp()
			.getRequest<AuthenticatedRequest>();
		const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
		if (scheme !== 'Bearer' || !token) {
			throw new UnauthorizedException('Bearer token is required');
		}
		if (this.tokenBlacklistService.isRevoked(token)) {
			throw new UnauthorizedException('token has been revoked');
		}

		try {
			request.user = await this.jwtService.verifyAsync<{ sub: string }>(
				token,
			);
			request.authToken = token;
			return true;
		} catch {
			throw new UnauthorizedException('invalid or expired token');
		}
	}
}
