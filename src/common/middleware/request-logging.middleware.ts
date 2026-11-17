import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

type RequestWithId = Request & { requestId?: string };

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
	private readonly logger = new Logger(RequestLoggingMiddleware.name);

	use(request: RequestWithId, response: Response, next: NextFunction) {
		const requestId = randomUUID();
		const startedAt = process.hrtime.bigint();
		request.requestId = requestId;
		response.setHeader('x-request-id', requestId);

		response.on('finish', () => {
			const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
			this.logger.log(
				JSON.stringify({
					event: 'http.request.completed',
					requestId,
					method: request.method,
					path: request.path,
					statusCode: response.statusCode,
					durationMs: Math.round(durationMs * 100) / 100,
				}),
			);
		});

		next();
	}
}
