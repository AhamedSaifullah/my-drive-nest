import { GoogleProvider } from './google.provider';

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
});
