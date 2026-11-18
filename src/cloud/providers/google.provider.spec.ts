import { GoogleProvider } from './google.provider';
import { CloudProviderHttpError } from './cloud-provider.error';

describe('GoogleProvider', () => {
	let provider: GoogleProvider;

	beforeEach(() => {
		provider = new GoogleProvider();
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('requests Drive file fields, includes folders, and filters trashed files', async () => {
		const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
			ok: true,
			json: jest.fn().mockResolvedValue({
				files: [{
					id: 'folder-1',
					name: 'Photos',
					mimeType: 'application/vnd.google-apps.folder',
					parents: ['root'],
				}],
				nextPageToken: 'page-2',
			}),
		} as never);

		const page = await provider.listFiles('access-token');
		const requestUrl = String(fetchMock.mock.calls[0][0]);

		expect(requestUrl).toContain('q=trashed+%3D+false');
		expect(requestUrl).toContain('fields=nextPageToken%2Cfiles');
		expect(page.nextPageToken).toBe('page-2');
		expect(page.files[0]).toMatchObject({
			providerFileId: 'folder-1',
			mimeType: 'application/vnd.google-apps.folder',
			category: 'other',
		});
	});

	it('fetches every page from Drive', async () => {
		const json = jest.fn()
			.mockResolvedValueOnce({
				files: [{ id: 'file-1', name: 'one.txt' }],
				nextPageToken: 'page-2',
			})
			.mockResolvedValueOnce({
				files: [{ id: 'file-2', name: 'two.txt' }],
			});
		const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
			ok: true,
			json,
		} as never);

		const files = [];
		for await (const file of provider.listAllFiles('access-token')) files.push(file);

		expect(files.map((file) => file.providerFileId)).toEqual(['file-1', 'file-2']);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(String(fetchMock.mock.calls[1][0])).toContain('pageToken=page-2');
	});

	it('marks rate limits as retryable and preserves Retry-After', async () => {
		const response = {
			ok: false,
			status: 429,
			headers: new Headers({ 'retry-after': '3' }),
			clone: () => ({ json: jest.fn().mockResolvedValue({}) }),
		};
		jest.spyOn(global, 'fetch').mockResolvedValue(response as never);

		await expect(provider.listFiles('access-token')).rejects.toMatchObject<Partial<CloudProviderHttpError>>({
			status: 429,
			retryable: true,
			retryAfterMs: 3000,
		});
	});

	it('forwards a range request when downloading media', async () => {
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new Uint8Array([1, 2, 3]));
				controller.close();
			},
		});
		const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
			ok: true,
			status: 206,
			body,
			headers: new Headers({ 'content-range': 'bytes 0-2/10' }),
		} as never);

		await provider.downloadFile('access-token', 'file-1', 'bytes=0-2');

		expect(fetchMock).toHaveBeenCalledWith(
			expect.stringContaining('/files/file-1?alt=media'),
			expect.objectContaining({ headers: { authorization: 'Bearer access-token', range: 'bytes=0-2' } }),
		);
	});
});
