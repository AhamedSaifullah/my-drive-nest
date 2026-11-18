export type CloudProviderFile = {
	providerFileId: string;
	name: string;
	mimeType?: string;
	size?: number;
	modifiedAt?: Date;
	thumbnailUrl?: string;
	parentId?: string;
	trashed?: boolean;
};

export type CloudFilePage = {
	files: CloudProviderFile[];
	nextPageToken?: string;
};

export type CloudFileChange = {
	providerFileId: string;
	removed: boolean;
	file?: CloudProviderFile;
};

export type CloudChangePage = {
	changes: CloudFileChange[];
	nextPageToken?: string;
	newStartPageToken?: string;
};

export interface CloudProvider {
	readonly name: string;
	listFiles(accessToken: string, pageToken?: string): Promise<CloudFilePage>;
	listAllFiles(accessToken: string): AsyncGenerator<CloudProviderFile>;
	listChanges(accessToken: string, pageToken: string): Promise<CloudChangePage>;
	downloadFile(accessToken: string, providerFileId: string): Promise<Response>;
	revoke(accessToken: string): Promise<void>;
}
