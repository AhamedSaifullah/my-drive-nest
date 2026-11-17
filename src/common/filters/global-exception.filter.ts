import {
	ArgumentsHost,
	Catch,
	ExceptionFilter,
	HttpException,
	HttpStatus,
	Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

type RequestWithId = Request & { requestId?: string };

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
	private readonly logger = new Logger(GlobalExceptionFilter.name);

	catch(exception: unknown, host: ArgumentsHost) {
		const context = host.switchToHttp();
		const request = context.getRequest<RequestWithId>();
		const response = context.getResponse<Response>();
		const isHttpException = exception instanceof HttpException;
		const status = isHttpException
			? exception.getStatus()
			: HttpStatus.INTERNAL_SERVER_ERROR;
		const message = isHttpException
			? this.safeMessage(exception.getResponse())
			: 'Internal server error';

		const logEntry = {
			event: 'http.request.failed',
			requestId: request.requestId,
			method: request.method,
			path: request.path,
			statusCode: status,
			error: exception instanceof Error ? exception.name : 'UnknownError',
		};
		this.logger.error(JSON.stringify(logEntry));

		response.status(status).json({
			statusCode: status,
			error: this.errorName(status),
			message,
			path: request.path,
			method: request.method,
			timestamp: new Date().toISOString(),
			requestId: request.requestId,
		});
	}

	private safeMessage(exceptionResponse: string | object) {
		if (!exceptionResponse) return 'Request failed';
		if (typeof exceptionResponse === 'string') {
			return this.redact(exceptionResponse);
		}

		const response = exceptionResponse as { message?: unknown };
		if (Array.isArray(response.message)) {
			return response.message.map((item) =>
				typeof item === 'string' ? this.redact(item) : 'Request validation failed',
			);
		}
		if (typeof response.message === 'string') {
			return this.redact(response.message);
		}
		return 'Request failed';
	}

	private redact(value: string) {
		return value.replace(
			/(authorization|access[_-]?token|refresh[_-]?token|client[_-]?secret|password)\s*[:=]\s*[^\s,]+/gi,
			'$1=[REDACTED]',
		);
	}

	private errorName(status: number) {
		if (status >= 500) return 'Internal Server Error';
		return HttpStatus[status] ?? 'Request Error';
	}
}
