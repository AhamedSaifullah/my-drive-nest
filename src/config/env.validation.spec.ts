import { validateEnvironment } from './env.validation';

const validConfig = () => ({
	MONGODB_URI: 'mongodb://localhost/my-drive',
	JWT_SECRET: 'a-long-development-secret',
	GOOGLE_CLIENT_ID: 'client-id',
	GOOGLE_CLIENT_SECRET: 'client-secret',
	GOOGLE_REDIRECT_URI: 'https://example.test/callback',
	CLOUD_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64url'),
	CLOUD_TOKEN_ENCRYPTION_KEY_VERSION: 'v1',
	CLOUD_DEEP_LINK: 'mydrive://linked',
	PORT: 3000,
});

describe('validateEnvironment', () => {
	it('accepts a complete valid configuration', () => {
		expect(validateEnvironment(validConfig())).toEqual(validConfig());
	});

	it('reports all missing required variables', () => {
		expect(() => validateEnvironment({})).toThrow(
			'MONGODB_URI, JWT_SECRET, GOOGLE_CLIENT_ID',
		);
	});

	it('rejects encryption keys that are not exactly 32 bytes', () => {
		expect(() => validateEnvironment({
			...validConfig(),
			CLOUD_TOKEN_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64url'),
		})).toThrow('exactly 32 bytes');
	});
});
