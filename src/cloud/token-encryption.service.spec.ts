import { ConfigService } from '@nestjs/config';
import { TokenEncryptionService } from './token-encryption.service';

describe('TokenEncryptionService', () => {
	const key = Buffer.alloc(32, 7).toString('base64url');
	let service: TokenEncryptionService;

	beforeEach(() => {
		service = new TokenEncryptionService(
			new ConfigService({
				CLOUD_TOKEN_ENCRYPTION_KEY: key,
				CLOUD_TOKEN_ENCRYPTION_KEY_VERSION: 'v1',
			}),
		);
	});

	it('round-trips encrypted token values', () => {
		const encrypted = service.encrypt('google-refresh-token');

		expect(encrypted.keyVersion).toBe('v1');
		expect(encrypted.ciphertext.startsWith('v1.')).toBe(true);
		expect(service.decrypt(encrypted.ciphertext)).toBe('google-refresh-token');
	});

	it('rejects tampered ciphertext', () => {
		const encrypted = service.encrypt('google-access-token');
		const parts = encrypted.ciphertext.split('.');
		parts[3] = `${parts[3]}A`;

		expect(() => service.decrypt(parts.join('.'))).toThrow(
			'unable to decrypt token',
		);
	});
});
