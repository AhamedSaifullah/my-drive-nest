import type { FileCategory } from './entities/file.schema';

const DOCUMENT_MIME_TYPES = new Set([
	'application/pdf',
	'application/msword',
	'application/rtf',
	'application/epub+zip',
	'application/vnd.ms-excel',
	'application/vnd.ms-powerpoint',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	'application/vnd.google-apps.document',
	'application/vnd.google-apps.spreadsheet',
	'application/vnd.google-apps.presentation',
	'application/vnd.oasis.opendocument.text',
	'application/vnd.oasis.opendocument.spreadsheet',
	'application/vnd.oasis.opendocument.presentation',
	'text/plain',
	'text/csv',
	'text/markdown',
	'text/html',
]);

export function classifyMimeType(mimeType?: string | null): FileCategory {
	const normalizedMimeType = mimeType?.trim().toLowerCase();
	if (!normalizedMimeType) return 'other';

	if (normalizedMimeType.startsWith('image/')) return 'image';
	if (normalizedMimeType.startsWith('video/')) return 'video';
	if (normalizedMimeType.startsWith('audio/')) return 'audio';
	if (DOCUMENT_MIME_TYPES.has(normalizedMimeType)) return 'document';

	return 'other';
}
