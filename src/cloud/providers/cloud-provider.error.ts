export class CloudProviderHttpError extends Error {
	constructor(
		readonly status: number,
		readonly retryable: boolean,
		readonly retryAfterMs?: number,
	) {
		super(`Cloud provider request failed with status ${status}`);
		this.name = 'CloudProviderHttpError';
	}
}
