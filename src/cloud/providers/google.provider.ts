import { BadRequestException, Injectable } from '@nestjs/common';
import {
	CloudChangePage,
	CloudFilePage,
	CloudProvider,
	CloudProviderFile,
} from './cloud-provider.interface';
import { classifyMimeType } from '../file-classifier';

@Injectable()
export class GoogleProvider implements CloudProvider {
	readonly name = 'google';

	async listFiles(accessToken: string, pageToken?: string): Promise<CloudFilePage> {
		const params = new URLSearchParams({
			q: 'trashed = false',
			spaces: 'drive',
			pageSize: '1000',
			fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,thumbnailLink,parents,trashed)',
		});
		if (pageToken) params.set('pageToken', pageToken);
		const body = await this.request<{ nextPageToken?: string; files?: GoogleFile[] }>(
			`https://www.googleapis.com/drive/v3/files?${params}`,
			accessToken,
		);
		return {
			files: (body.files ?? []).map((file) => this.mapFile(file)),
			nextPageToken: body.nextPageToken,
		};
	}

	async *listAllFiles(accessToken: string): AsyncGenerator<CloudProviderFile> {
		let pageToken: string | undefined;
		do {
			const page = await this.listFiles(accessToken, pageToken);
			for (const file of page.files) yield file;
			pageToken = page.nextPageToken;
		} while (pageToken);
	}

	async getStartPageToken(accessToken: string) {
		const body = await this.request<{ startPageToken: string }>(
			'https://www.googleapis.com/drive/v3/changes/startPageToken',
			accessToken,
		);
		return body.startPageToken;
	}

	async listChanges(accessToken: string, pageToken: string): Promise<CloudChangePage> {
		const params = new URLSearchParams({
			pageToken,
			includeRemoved: 'true',
			spaces: 'drive',
			fields: 'nextPageToken,newStartPageToken,changes(fileId,removed,file(id,name,mimeType,size,modifiedTime,thumbnailLink,parents,trashed))',
		});
		const body = await this.request<{ nextPageToken?: string; newStartPageToken?: string; changes?: GoogleChange[] }>(
			`https://www.googleapis.com/drive/v3/changes?${params}`,
			accessToken,
		);
		return {
			changes: (body.changes ?? []).map((change) => ({
				providerFileId: change.fileId,
				removed: change.removed === true,
				file: change.file ? this.mapFile(change.file) : undefined,
			})),
			nextPageToken: body.nextPageToken,
			newStartPageToken: body.newStartPageToken,
		};
	}

	async downloadFile(accessToken: string, providerFileId: string) {
		const response = await fetch(
			`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(providerFileId)}?alt=media`,
			{ headers: { authorization: `Bearer ${accessToken}` } },
		);
		if (!response.ok) throw new BadRequestException('Google file download failed');
		return response;
	}

	async revoke(accessToken: string) {
		const response = await fetch('https://oauth2.googleapis.com/revoke', {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ token: accessToken }),
		});
		if (!response.ok && response.status !== 400) {
			throw new BadRequestException('Google token revocation failed');
		}
	}

	private async request<T>(url: string, accessToken: string): Promise<T> {
		const response = await fetch(url, {
			headers: { authorization: `Bearer ${accessToken}` },
		});
		if (!response.ok) throw new BadRequestException('Google Drive request failed');
		return (await response.json()) as T;
	}

	private mapFile(file: GoogleFile): CloudProviderFile {
		return {
			providerFileId: file.id,
			name: file.name,
			mimeType: file.mimeType,
			size: file.size ? Number(file.size) : undefined,
			modifiedAt: file.modifiedTime ? new Date(file.modifiedTime) : undefined,
			thumbnailUrl: file.thumbnailLink,
			parentId: file.parents?.[0],
			trashed: file.trashed,
			category: classifyMimeType(file.mimeType),
		};
	}
}

type GoogleFile = {
	id: string;
	name: string;
	mimeType?: string;
	size?: string;
	modifiedTime?: string;
	thumbnailLink?: string;
	parents?: string[];
	trashed?: boolean;
};

type GoogleChange = {
	fileId: string;
	removed?: boolean;
	file?: GoogleFile;
};
