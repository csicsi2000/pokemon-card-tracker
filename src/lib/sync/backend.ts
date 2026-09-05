/**
 * What the sync engine needs from wherever the data file lives: one JSON file that can be
 * found, read, written, and cheaply checked for "did it change since I last looked", plus
 * a companion file for the readable Markdown export. Google Drive and WebDAV both fit.
 */

export type SyncProvider = 'drive' | 'webdav';

export type RemoteFileMeta = {
	/** Whatever the backend uses to address the file again (Drive file id, WebDAV name). */
	id: string;
	/** Changes whenever the content does: Drive's integer version, a WebDAV ETag, a hash. */
	version: string | number;
	modifiedTime: string;
};

export type SyncBackend = {
	/** The data file, or null when there is none yet. */
	findFile(): Promise<RemoteFileMeta | null>;
	createFile(json: string): Promise<RemoteFileMeta>;
	/** Current metadata, or null when the file is gone. */
	getMeta(fileId: string): Promise<RemoteFileMeta | null>;
	download(fileId: string): Promise<string>;
	upload(fileId: string, json: string): Promise<RemoteFileMeta>;
	/**
	 * Write a secondary file next to the data file — the human/agent-readable Markdown
	 * export. Created on first use, overwritten afterwards; never read back.
	 */
	putCompanion(tag: string, name: string, mimeType: string, body: string): Promise<void>;
};

/** The server rejected our credentials: token expired or revoked, wrong password. */
export class SyncAuthError extends Error {
	constructor(message = 'The server rejected the sign-in') {
		super(message);
		this.name = 'SyncAuthError';
	}
}

/** The file we were syncing to no longer exists (trashed or deleted by hand). */
export class SyncMissingError extends Error {
	constructor(message = 'The remote file is gone') {
		super(message);
		this.name = 'SyncMissingError';
	}
}
