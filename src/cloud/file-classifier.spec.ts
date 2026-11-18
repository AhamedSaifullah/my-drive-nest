import { classifyMimeType } from './file-classifier';

describe('classifyMimeType', () => {
	it.each([
		['image/jpeg', 'image'],
		['video/mp4', 'video'],
		['audio/mpeg', 'audio'],
		['application/pdf', 'document'],
		['application/vnd.google-apps.document', 'document'],
		['application/vnd.google-apps.spreadsheet', 'document'],
		['application/vnd.google-apps.presentation', 'document'],
		['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'document'],
		['text/plain', 'document'],
		['text/csv', 'document'],
		['application/octet-stream', 'other'],
		['application/vnd.google-apps.folder', 'other'],
		[undefined, 'other'],
		[null, 'other'],
	] as const)('classifies %s as %s', (mimeType, expected) => {
		expect(classifyMimeType(mimeType)).toBe(expected);
	});

	it('normalizes whitespace and case', () => {
		expect(classifyMimeType('  IMAGE/PNG ')).toBe('image');
	});
});
