const REQUIRED_ENVIRONMENT_VARIABLES = [
	'MONGODB_URI',
	'JWT_SECRET',
	'GOOGLE_CLIENT_ID',
	'GOOGLE_CLIENT_SECRET',
	'GOOGLE_REDIRECT_URI',
	'CLOUD_TOKEN_ENCRYPTION_KEY',
	'CLOUD_TOKEN_ENCRYPTION_KEY_VERSION',
	'CLOUD_DEEP_LINK',
] as const;

export function validateEnvironment(config: Record<string, unknown>) {
	const missing = REQUIRED_ENVIRONMENT_VARIABLES.filter((name) => {
		const value = config[name];
		return typeof value !== 'string' || value.trim().length === 0;
	});

	if (missing.length > 0) {
		throw new Error(
			`Configuration validation failed. Missing required environment variables: ${missing.join(', ')}`,
		);
	}

	const encryptionKey = Buffer.from(
		config.CLOUD_TOKEN_ENCRYPTION_KEY as string,
		'base64url',
	);
	if (encryptionKey.length !== 32) {
		throw new Error(
			'CLOUD_TOKEN_ENCRYPTION_KEY must be a base64url value that decodes to exactly 32 bytes',
		);
	}

	const redirectUri = config.GOOGLE_REDIRECT_URI as string;
	if (!redirectUri.startsWith('https://')) {
		throw new Error('GOOGLE_REDIRECT_URI must use HTTPS');
	}

	const port = config.PORT ?? 3000;
	if (!/^\d+$/.test(String(port)) || Number(port) < 1 || Number(port) > 65535) {
		throw new Error('PORT must be an integer between 1 and 65535');
	}

	return config;
}
