import { Injectable } from '@nestjs/common';

@Injectable()
export class TokenBlacklistService {
	private readonly revokedTokens = new Set<string>();

	revoke(token: string) {
		this.revokedTokens.add(token);
	}

	isRevoked(token: string) {
		return this.revokedTokens.has(token);
	}
}
