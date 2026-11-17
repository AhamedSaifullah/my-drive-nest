import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export type EncryptedToken = {
	ciphertext: string;
	keyVersion: string;
};

@Injectable()
export class TokenEncryptionService {
	constructor(private readonly config: ConfigService) {}

	encrypt(plaintext: string): EncryptedToken {
		const keyVersion = this.config.getOrThrow<string>(
			'CLOUD_TOKEN_ENCRYPTION_KEY_VERSION',
		);
		const iv = randomBytes(12);
		const cipher = createCipheriv('aes-256-gcm', this.keyFor(keyVersion), iv);
		const ciphertext = Buffer.concat([
			cipher.update(plaintext, 'utf8'),
			cipher.final(),
		]);
		return {
			keyVersion,
			ciphertext: [
				keyVersion,
				iv.toString('base64url'),
				cipher.getAuthTag().toString('base64url'),
				ciphertext.toString('base64url'),
			].join('.'),
		};
	}

	decrypt(value: string): string {
		const [keyVersion, encodedIv, encodedTag, encodedCiphertext] =
			value.split('.');
		if (!keyVersion || !encodedIv || !encodedTag || !encodedCiphertext) {
			throw new Error('invalid encrypted token format');
		}

		try {
			const decipher = createDecipheriv(
				'aes-256-gcm',
				this.keyFor(keyVersion),
				Buffer.from(encodedIv, 'base64url'),
			);
			decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
			return Buffer.concat([
				decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
				decipher.final(),
			]).toString('utf8');
		} catch {
			throw new Error('unable to decrypt token');
		}
	}

	private keyFor(version: string) {
		const activeVersion = this.config.getOrThrow<string>(
			'CLOUD_TOKEN_ENCRYPTION_KEY_VERSION',
		);
		const encodedKey =
			version === activeVersion
				? this.config.get<string>('CLOUD_TOKEN_ENCRYPTION_KEY')
				: this.config.get<string>(
						`CLOUD_TOKEN_ENCRYPTION_KEY_${version.toUpperCase()}`,
				  );
		if (!encodedKey) {
			throw new InternalServerErrorException(
				`encryption key version ${version} is not configured`,
			);
		}
		const key = Buffer.from(encodedKey, 'base64url');
		if (key.length !== 32) {
			throw new InternalServerErrorException(
				`encryption key version ${version} must decode to 32 bytes`,
			);
		}
		return key;
	}
}
