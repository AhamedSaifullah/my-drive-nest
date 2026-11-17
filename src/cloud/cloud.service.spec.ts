import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';
import { CloudService } from './cloud.service';

describe('CloudService', () => {
	const userId = new Types.ObjectId().toString();
	const accountId = new Types.ObjectId();
	const accountModel = {
		findOne: jest.fn(),
		findOneAndUpdate: jest.fn(),
		updateOne: jest.fn(),
	};
	const oauthStateModel = {
		create: jest.fn(),
		findOneAndDelete: jest.fn(),
	};
	const fileModel = {};
	const jwtService = {
		signAsync: jest.fn(),
		verifyAsync: jest.fn(),
	};
	const tokenEncryption = {
		encrypt: jest.fn((value: string) => ({ ciphertext: `v1.${value}`, keyVersion: 'v1' })),
		decrypt: jest.fn((value: string) => value.replace('encrypted-', '')),
	};
	let service: CloudService;

	beforeEach(() => {
		jest.clearAllMocks();
		service = new CloudService(
			accountModel as never,
			oauthStateModel as never,
			fileModel as never,
			new ConfigService({
				GOOGLE_CLIENT_ID: 'client-id',
				GOOGLE_CLIENT_SECRET: 'client-secret',
				GOOGLE_REDIRECT_URI: 'https://example.test/callback',
				CLOUD_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64url'),
				CLOUD_TOKEN_ENCRYPTION_KEY_VERSION: 'v1',
				CLOUD_DEEP_LINK: 'mydrive://linked',
			}),
			jwtService as unknown as JwtService,
			tokenEncryption as never,
		);
	});

	it('creates a signed Google authorization URL and stores state', async () => {
		oauthStateModel.create.mockResolvedValue({});
		jwtService.signAsync.mockResolvedValue('signed-state');

		const result = await service.createGoogleAuthorizationUrl(userId);

		expect(result.authorizationUrl).toContain('state=signed-state');
		expect(result.authorizationUrl).toContain('access_type=offline');
		expect(result.authorizationUrl).toContain('prompt=consent');
		expect(oauthStateModel.create).toHaveBeenCalledWith(expect.objectContaining({
			purpose: 'google-link',
		}));
	});

	it('redirects invalid callback state without exchanging a code', async () => {
		jwtService.verifyAsync.mockRejectedValue(new Error('invalid state'));
		const response = { redirect: jest.fn() };

		await service.handleGoogleCallback('code', 'bad-state', undefined, response as never);

		expect(response.redirect).toHaveBeenCalledWith('mydrive://linked?error=invalid_state');
	});

	it('returns a valid cached access token before expiry', async () => {
		accountModel.findOne.mockReturnValue({
			exec: jest.fn().mockResolvedValue({
				_id: accountId,
				status: 'active',
				expiresAt: new Date(Date.now() + 10 * 60 * 1000),
				encryptedAccessToken: 'encrypted-cached-access',
			}),
		});

		await expect(service.getGoogleAccessToken(userId, accountId.toString()))
			.resolves.toBe('cached-access');
	});

	it('refreshes an expired access token and stores the replacement', async () => {
		accountModel.findOne.mockReturnValue({
			exec: jest.fn().mockResolvedValue({
				_id: accountId,
				status: 'active',
				expiresAt: new Date(Date.now() - 1000),
				encryptedAccessToken: 'encrypted-old-access',
				encryptedRefreshToken: 'encrypted-refresh-token',
			}),
		});
		accountModel.updateOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({}) });
		const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
			ok: true,
			json: jest.fn().mockResolvedValue({ access_token: 'new-access', expires_in: 3600 }),
		} as never);

		await expect(service.getGoogleAccessToken(userId, accountId.toString()))
			.resolves.toBe('new-access');
		expect(fetchMock).toHaveBeenCalledWith(
			'https://oauth2.googleapis.com/token',
			expect.objectContaining({ method: 'POST' }),
		);
		expect(accountModel.updateOne).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ $set: expect.objectContaining({ status: 'active' }) }),
		);
		fetchMock.mockRestore();
	});

	it('marks an account as needing reauthorization when refresh fails', async () => {
		accountModel.findOne.mockReturnValue({
			exec: jest.fn().mockResolvedValue({
				_id: accountId,
				status: 'active',
				expiresAt: new Date(Date.now() - 1000),
				encryptedRefreshToken: 'encrypted-refresh-token',
			}),
		});
		accountModel.updateOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({}) });
		const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as never);

		await expect(service.getGoogleAccessToken(userId, accountId.toString()))
			.rejects.toThrow('needs reauthorization');
		expect(accountModel.updateOne).toHaveBeenCalledWith(
			expect.objectContaining({ _id: accountId }),
			{ $set: { status: 'needs_reauth' } },
		);
		fetchMock.mockRestore();
	});
});
