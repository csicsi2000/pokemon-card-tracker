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

import { SyncAuthError, SyncMissingError, type RemoteFileMeta, type SyncBackend } from './backend';

export type DriveFileMeta = RemoteFileMeta & { version: number };

type RawMeta = { id: string; version: string | number; modifiedTime: string };

const toMeta = (raw: RawMeta): DriveFileMeta => ({
	id: raw.id,
	version: Number(raw.version),
	modifiedTime: raw.modifiedTime
});

/**
 * Drive answers 403 for two unrelated things: a sign-in that may not do this (fixed by
 * reconnecting) and a limit that was hit (fixed by waiting, or by freeing space). Telling
 * them apart takes the `reason` in the error body. Only these mean the grant is wrong.
 */
const AUTH_REASONS = new Set([
	'authError',
	'insufficientPermissions',
	'insufficientFilePermissions',
	'appNotAuthorizedToFile',
	'forbidden'
]);

/** Limits, in words a user can act on. Reconnecting fixes none of them. */
const LIMIT_MESSAGES: Record<string, string> = {
	storageQuotaExceeded:
		'Your Google Drive is full, so Cardex could not save to it. Free up space in Drive, then sync again.',
	userRateLimitExceeded: 'Google Drive is asking Cardex to slow down. It will try again shortly.',
	rateLimitExceeded: 'Google Drive is asking Cardex to slow down. It will try again shortly.',
	dailyLimitExceeded: 'Google Drive’s daily limit for Cardex is used up. Sync will work again tomorrow.'
};

/** The first `reason` (and Drive's own message) from a Drive error body, if it has one. */
async function errorReason(response: Response): Promise<{ reason?: string; message?: string }> {
	try {
		const body = (await response.json()) as {
			error?: { message?: string; errors?: { reason?: string }[] };
		};
		return { reason: body.error?.errors?.[0]?.reason, message: body.error?.message };
	} catch {
		return {};
	}
}

export function createDriveClient(
	getToken: () => Promise<string>,
	fetchImpl: typeof fetch = fetch
): SyncBackend {
	async function call(url: string, init: RequestInit = {}): Promise<Response> {
		const token = await getToken();
		const response = await fetchImpl(url, {
			...init,
			headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` }
		});
		if (response.status === 401) throw new SyncAuthError('Google Drive rejected the sign-in');
		if (response.status === 403) {
			const { reason, message } = await errorReason(response);
			// No readable reason: assume the grant, as before — reconnecting is the likely fix.
			if (!reason || AUTH_REASONS.has(reason)) {
				throw new SyncAuthError('Google Drive rejected the sign-in');
			}
			throw new Error(
				LIMIT_MESSAGES[reason] ?? `Google Drive refused the request: ${message ?? reason}`
			);
		}
		if (response.status === 429) throw new Error(LIMIT_MESSAGES.rateLimitExceeded);
		if (response.status === 404) throw new SyncMissingError('The Drive file is gone');
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
				if (error instanceof SyncMissingError) return null;
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
				if (!(error instanceof SyncMissingError)) throw error;
				id = (await createTagged(tag, name, mimeType, body)).id; // was deleted by hand
			}
			companionIds.set(tag, id);
		}
	};
}
