import {
	BadRequestException,
	Injectable,
	InternalServerErrorException,
	Logger,
	UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createCipheriv, randomBytes } from 'node:crypto';
import { Response } from 'express';
import { CloudAccount, CloudAccountDocument } from './entities/cloud-account.schema';

type GoogleTokenResponse = {
	access_token: string;
	refresh_token?: string;
	expires_in?: number;
	token_type?: string;
};

type GoogleProfile = { sub?: string };

@Injectable()
export class CloudService {
	private readonly logger = new Logger(CloudService.name);
	private readonly pendingNonces = new Map<string, number>();

	constructor(
		@InjectModel(CloudAccount.name)
		private readonly accountModel: Model<CloudAccountDocument>,
		private readonly config: ConfigService,
		private readonly jwtService: JwtService,
	) {}

	async createGoogleAuthorizationUrl(userId: string) {
		this.requireGoogleConfig();
		const nonce = randomBytes(24).toString('hex');
		this.pendingNonces.set(nonce, Date.now() + 10 * 60 * 1000);
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
		if (!state) throw new BadRequestException('state is required');

		let payload: { sub: string; nonce: string; purpose: string };
		try {
			payload = await this.jwtService.verifyAsync<{
				sub: string;
				nonce: string;
				purpose: string;
			}>(state);
		} catch {
			throw new UnauthorizedException('invalid or expired OAuth state');
		}
		const expiry = this.pendingNonces.get(payload.nonce);
		this.pendingNonces.delete(payload.nonce);
		if (payload.purpose !== 'google-link' || !expiry || expiry < Date.now()) {
			throw new UnauthorizedException('invalid or already-used OAuth state');
		}
		if (error) return this.redirect(response, `error=${encodeURIComponent(error)}`);
		if (!code) throw new BadRequestException('code is required');

		try {
			const tokens = await this.exchangeCode(code);
			if (!tokens.refresh_token) {
				throw new BadRequestException('Google did not return a refresh token');
			}
			const profile = await this.googleFetch<GoogleProfile>('https://openidconnect.googleapis.com/v1/userinfo', tokens.access_token);
			if (!profile.sub) throw new BadRequestException('Google account id was not returned');
			await this.accountModel.findOneAndUpdate(
				{ userId: new Types.ObjectId(payload.sub), provider: 'google' },
				{
					userId: new Types.ObjectId(payload.sub), provider: 'google', providerAccountId: profile.sub,
					encryptedAccessToken: this.encrypt(tokens.access_token),
					encryptedRefreshToken: this.encrypt(tokens.refresh_token),
					expiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000), status: 'active',
				},
				{ upsert: true, new: true, setDefaultsOnInsert: true },
			).exec();
			return this.redirect(response, 'provider=google');
		} catch (cause) {
			this.logger.error(`Google callback failed: ${cause instanceof Error ? cause.message : 'unknown error'}`);
			if (cause instanceof BadRequestException) throw cause;
			return this.redirect(response, 'error=link_failed');
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

	private encrypt(value: string) {
		const key = this.encryptionKey();
		const iv = randomBytes(12);
		const cipher = createCipheriv('aes-256-gcm', key, iv);
		const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
		return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
	}

	private encryptionKey() {
		const encoded = this.config.get<string>('CLOUD_TOKEN_ENCRYPTION_KEY');
		if (!encoded) throw new InternalServerErrorException('CLOUD_TOKEN_ENCRYPTION_KEY is required');
		const key = Buffer.from(encoded, 'base64url');
		if (key.length !== 32) throw new InternalServerErrorException('CLOUD_TOKEN_ENCRYPTION_KEY must decode to 32 bytes');
		return key;
	}

	private requireGoogleConfig() {
		for (const name of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'CLOUD_TOKEN_ENCRYPTION_KEY']) this.config.getOrThrow<string>(name);
	}

	private redirect(response: Response, query: string) {
		const deepLink = this.config.get<string>('CLOUD_DEEP_LINK') ?? 'mydrive://linked';
		return response.redirect(`${deepLink}?${query}`);
	}
}
