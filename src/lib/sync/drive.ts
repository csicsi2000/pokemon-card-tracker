/**
 * The little of the Google Drive REST API this app needs: one JSON file, in a "Cardex"
 * folder the user can see in My Drive. Scope `drive.file` means the app only ever sees
 * files it created itself.
 *
 * Both file and folder are tagged with `appProperties`, so they are found again by tag
 * rather than by name — renaming them in Drive does no harm. The integer `version` Drive
 * keeps per file is the cheap "did anything change since I last looked" check.
 */

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const FILE_NAME = 'cardex-data.json';
const FOLDER_NAME = 'Cardex';
const META_FIELDS = 'id,version,modifiedTime';

export type DriveFileMeta = { id: string; version: number; modifiedTime: string };

export type DriveClient = {
	/** The oldest tagged data file, or null when the account has none yet. */
	findFile(): Promise<DriveFileMeta | null>;
	createFile(json: string): Promise<DriveFileMeta>;
	getMeta(fileId: string): Promise<DriveFileMeta | null>;
	download(fileId: string): Promise<string>;
	upload(fileId: string, json: string): Promise<DriveFileMeta>;
	/**
	 * Write a secondary, tagged file next to the data file — the human/agent-readable
	 * Markdown export. Found by tag and created on first use; never read back.
	 */
	putCompanion(tag: string, name: string, mimeType: string, body: string): Promise<void>;
};

/** 401/403 from Drive: the token is gone or was revoked. */
export class DriveAuthError extends Error {
	constructor(message = 'Google Drive rejected the sign-in') {
		super(message);
		this.name = 'DriveAuthError';
	}
}

/** The file we were syncing to no longer exists (trashed or deleted by hand). */
export class DriveMissingError extends Error {
	constructor(message = 'The Drive file is gone') {
		super(message);
		this.name = 'DriveMissingError';
	}
}

type RawMeta = { id: string; version: string | number; modifiedTime: string };

const toMeta = (raw: RawMeta): DriveFileMeta => ({
	id: raw.id,
	version: Number(raw.version),
	modifiedTime: raw.modifiedTime
});

export function createDriveClient(
	getToken: () => Promise<string>,
	fetchImpl: typeof fetch = fetch
): DriveClient {
	async function call(url: string, init: RequestInit = {}): Promise<Response> {
		const token = await getToken();
		const response = await fetchImpl(url, {
			...init,
			headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` }
		});
		if (response.status === 401 || response.status === 403) throw new DriveAuthError();
		if (response.status === 404) throw new DriveMissingError();
		if (!response.ok) {
			throw new Error(`Google Drive returned ${response.status} ${response.statusText}`);
		}
		return response;
	}

	async function list(query: string): Promise<RawMeta[]> {
		const params = new URLSearchParams({
			q: query,
			orderBy: 'createdTime',
			fields: `files(${META_FIELDS})`,
			pageSize: '10'
		});
		const response = await call(`${API}/files?${params}`);
		const body = (await response.json()) as { files?: RawMeta[] };
		return body.files ?? [];
	}

	async function ensureFolder(): Promise<string> {
		const existing = await list(
			`mimeType='${FOLDER_MIME}' and trashed=false and appProperties has { key='cardex' and value='folder' }`
		);
		if (existing[0]) return existing[0].id;

		const response = await call(`${API}/files?fields=id`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name: FOLDER_NAME,
				mimeType: FOLDER_MIME,
				appProperties: { cardex: 'folder' }
			})
		});
		return ((await response.json()) as { id: string }).id;
	}

	async function createTagged(tag: string, name: string, mimeType: string, body: string) {
		const folderId = await ensureFolder();
		const boundary = `cardex-${Date.now().toString(36)}`;
		const metadata = JSON.stringify({
			name,
			parents: [folderId],
			mimeType,
			appProperties: { cardex: tag }
		});
		const payload =
			`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
			`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n${body}\r\n--${boundary}--`;

		const response = await call(`${UPLOAD}/files?uploadType=multipart&fields=${META_FIELDS}`, {
			method: 'POST',
			headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
			body: payload
		});
		return toMeta((await response.json()) as RawMeta);
	}

	async function uploadBody(fileId: string, mimeType: string, body: string) {
		const response = await call(`${UPLOAD}/files/${fileId}?uploadType=media&fields=${META_FIELDS}`, {
			method: 'PATCH',
			headers: { 'Content-Type': mimeType },
			body
		});
		return toMeta((await response.json()) as RawMeta);
	}

	const companionIds = new Map<string, string>();

	return {
		async findFile() {
			const files = await list(`trashed=false and appProperties has { key='cardex' and value='data' }`);
			return files[0] ? toMeta(files[0]) : null;
		},

		createFile(json) {
			return createTagged('data', FILE_NAME, 'application/json', json);
		},

		async getMeta(fileId) {
			try {
				const response = await call(`${API}/files/${fileId}?fields=${META_FIELDS},trashed`);
				const raw = (await response.json()) as RawMeta & { trashed?: boolean };
				return raw.trashed ? null : toMeta(raw);
			} catch (error) {
				if (error instanceof DriveMissingError) return null;
				throw error;
			}
		},

		async download(fileId) {
			const response = await call(`${API}/files/${fileId}?alt=media`);
			return response.text();
		},

		upload(fileId, json) {
			return uploadBody(fileId, 'application/json', json);
		},

		async putCompanion(tag, name, mimeType, body) {
			let id = companionIds.get(tag);
			if (!id) {
				const existing = await list(
					`trashed=false and appProperties has { key='cardex' and value='${tag}' }`
				);
				id = existing[0]?.id;
			}
			try {
				if (id) await uploadBody(id, mimeType, body);
				else id = (await createTagged(tag, name, mimeType, body)).id;
			} catch (error) {
				if (!(error instanceof DriveMissingError)) throw error;
				id = (await createTagged(tag, name, mimeType, body)).id; // was deleted by hand
			}
			companionIds.set(tag, id);
		}
	};
}
