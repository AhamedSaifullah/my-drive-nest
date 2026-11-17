import {
	BadRequestException,
	Injectable,
	Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash, randomBytes } from 'node:crypto';
import { Response } from 'express';
import { CloudAccount, CloudAccountDocument } from './entities/cloud-account.schema';
import { OAuthState, OAuthStateDocument } from './entities/oauth-state.schema';
import { TokenEncryptionService } from './token-encryption.service';

type GoogleTokenResponse = {
	access_token: string;
	refresh_token?: string;
	expires_in?: number;
	token_type?: string;
};

type GoogleProfile = {
	sub?: string;
	email?: string;
	name?: string;
};

@Injectable()
export class CloudService {
	private readonly logger = new Logger(CloudService.name);

	constructor(
		@InjectModel(CloudAccount.name)
		private readonly accountModel: Model<CloudAccountDocument>,
		@InjectModel(OAuthState.name)
		private readonly oauthStateModel: Model<OAuthStateDocument>,
		private readonly config: ConfigService,
		private readonly jwtService: JwtService,
		private readonly tokenEncryption: TokenEncryptionService,
	) {}

	async createGoogleAuthorizationUrl(userId: string) {
		this.requireGoogleConfig();
		const nonce = randomBytes(24).toString('hex');
		await this.oauthStateModel.create({
			userId: new Types.ObjectId(userId),
			nonceHash: this.hashNonce(nonce),
			purpose: 'google-link',
			expiresAt: new Date(Date.now() + 10 * 60 * 1000),
		});
		const state = await this.jwtService.signAsync(
			{ sub: userId, nonce, purpose: 'google-link' },
			{ expiresIn: '10m' },
		);
		const params = new URLSearchParams({
			client_id: this.config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
			redirect_uri: this.config.getOrThrow<string>('GOOGLE_REDIRECT_URI'),
			response_type: 'code',
			scope: 'openid email profile https://www.googleapis.com/auth/drive.readonly',
			access_type: 'offline',
			prompt: 'consent',
			state,
		});
		return { authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}` };
	}

	async handleGoogleCallback(
		code: string | undefined,
		state: string | undefined,
		error: string | undefined,
		response: Response,
	) {
		if (!state) return this.redirectError(response, 'invalid_state');

		let payload: { sub: string; nonce: string; purpose: string };
		try {
			payload = await this.jwtService.verifyAsync<{
				sub: string;
				nonce: string;
				purpose: string;
			}>(state);
		} catch {
			this.logger.warn(
				JSON.stringify({
					event: 'google.oauth.state_rejected',
					reason: 'invalid_signature_or_expired',
				}),
			);
			return this.redirectError(response, 'invalid_state');
		}
		if (
			!payload.sub ||
			!payload.nonce ||
			payload.purpose !== 'google-link' ||
			!Types.ObjectId.isValid(payload.sub)
		) {
			return this.redirectError(response, 'invalid_state');
		}

		let consumedState: OAuthStateDocument | null;
		try {
			consumedState = await this.oauthStateModel
				.findOneAndDelete({
					userId: new Types.ObjectId(payload.sub),
					nonceHash: this.hashNonce(payload.nonce),
					purpose: 'google-link',
					expiresAt: { $gt: new Date() },
				})
				.exec();
		} catch {
			this.logger.error(
				JSON.stringify({
					event: 'google.oauth.state_store_failed',
				}),
			);
			return this.redirectError(response, 'link_failed');
		}
		if (!consumedState) {
			return this.redirectError(response, 'invalid_state');
		}
		if (error) return this.redirectError(response, this.oauthErrorCode(error));
		if (!code) return this.redirectError(response, 'missing_code');

		try {
			const tokens = await this.exchangeCode(code);
			if (!tokens.refresh_token) {
				throw new BadRequestException('Google did not return a refresh token');
			}
			const profile = await this.googleFetch<GoogleProfile>('https://openidconnect.googleapis.com/v1/userinfo', tokens.access_token);
			if (!profile.sub || !profile.email || !profile.name) {
				throw new BadRequestException('Google account identity was not returned');
			}
			const encryptedAccessToken = this.tokenEncryption.encrypt(tokens.access_token);
			const encryptedRefreshToken = this.tokenEncryption.encrypt(tokens.refresh_token);
			await this.accountModel.findOneAndUpdate(
				{ userId: new Types.ObjectId(payload.sub), provider: 'google' },
				{
					userId: new Types.ObjectId(payload.sub), provider: 'google', providerAccountId: profile.sub,
					email: profile.email,
					displayName: profile.name,
					encryptedAccessToken: encryptedAccessToken.ciphertext,
					encryptedRefreshToken: encryptedRefreshToken.ciphertext,
					tokenKeyVersion: encryptedAccessToken.keyVersion,
					expiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000), status: 'active',
				},
				{ upsert: true, new: true, setDefaultsOnInsert: true },
			).exec();
			return this.redirect(response, 'provider=google');
		} catch (cause) {
			this.logger.error(
				JSON.stringify({
					event: 'google.oauth.callback_failed',
					error: cause instanceof Error ? cause.name : 'UnknownError',
				}),
			);
			return this.redirectError(response, 'link_failed');
		}
	}

	async listAccounts(userId: string) {
		return this.accountModel.find({ userId: new Types.ObjectId(userId) }).select('-encryptedAccessToken -encryptedRefreshToken').lean().exec();
	}

	async unlinkGoogle(userId: string) {
		await this.accountModel.updateOne({ userId: new Types.ObjectId(userId), provider: 'google' }, { $set: { status: 'revoked' } }).exec();
		return { message: 'Google Drive unlinked' };
	}

	private async exchangeCode(code: string) {
		const result = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: this.config.getOrThrow<string>('GOOGLE_CLIENT_ID'), client_secret: this.config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'), redirect_uri: this.config.getOrThrow<string>('GOOGLE_REDIRECT_URI'), grant_type: 'authorization_code' }) });
		if (!result.ok) throw new BadRequestException('Google token exchange failed');
		return (await result.json()) as GoogleTokenResponse;
	}

	private async googleFetch<T>(url: string, accessToken: string) {
		const result = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
		if (!result.ok) throw new BadRequestException('Google profile lookup failed');
		return (await result.json()) as T;
	}

	private hashNonce(nonce: string) {
		return createHash('sha256').update(nonce).digest('hex');
	}

	private requireGoogleConfig() {
		for (const name of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'CLOUD_TOKEN_ENCRYPTION_KEY', 'CLOUD_TOKEN_ENCRYPTION_KEY_VERSION']) this.config.getOrThrow<string>(name);
	}

	private redirect(response: Response, query: string) {
		const deepLink = this.config.get<string>('CLOUD_DEEP_LINK') ?? 'mydrive://linked';
		return response.redirect(`${deepLink}?${query}`);
	}

	private redirectError(response: Response, errorCode: string) {
		return this.redirect(response, `error=${encodeURIComponent(errorCode)}`);
	}

	private oauthErrorCode(error: string) {
		return error === 'access_denied' ? 'access_denied' : 'oauth_error';
	}
}
