/**
 * A WebDAV backend: the data file and its readable companion live as two plain files in
 * a folder on any WebDAV server the user runs or rents — Nextcloud, ownCloud, a Synology
 * NAS, `rclone serve webdav`, Apache/nginx with the DAV module, and so on.
 *
 * Only the HTTP verbs a file needs: HEAD to check, GET to read, PUT to write, MKCOL to
 * create the folder on first use. The "did it change" check prefers the server's ETag,
 * then Last-Modified, and as a last resort hashes the content — which is the only option
 * when the server's CORS setup does not expose those headers to the page.
 *
 * Because the app runs in the browser on a different origin, the server must answer CORS
 * preflights for this origin: methods HEAD, GET, PUT, MKCOL; headers Authorization and
 * Content-Type; ideally `Access-Control-Expose-Headers: ETag, Last-Modified`.
 *
 * That requirement is why the option is hidden by default — see `webdavEnabled` below.
 */
import { SyncAuthError, SyncMissingError, type RemoteFileMeta, type SyncBackend } from './backend';

/**
 * Whether Settings offers WebDAV as a place to sync to. Off unless the build sets
 * PUBLIC_ENABLE_WEBDAV, because the CORS requirement above rules out every hosted service
 * that speaks WebDAV — Koofr, pCloud, Box and the like send no `Access-Control-Allow-Origin`
 * and have no setting for it, so the browser blocks the preflight and the connection can
 * never succeed. Only a server the user runs and configures can work, and offering the form
 * to everyone else just produces a confusing failure. The backend below stays built and
 * tested either way; flip the flag when there is a server to point it at.
 */
export const webdavEnabled = (): boolean => __WEBDAV_ENABLED__;

export type WebDavConfig = {
	/** Folder URL, e.g. `https://cloud.example.com/remote.php/dav/files/anna/Cardex/`. */
	url: string;
	username: string;
	password: string;
};

export const WEBDAV_FILE_NAME = 'cardex-data.json';

/** Trim, add the scheme if it was left off, and end with a slash so names append cleanly. */
export function normalizeWebDavUrl(url: string): string {
	let value = url.trim();
	if (!value) return '';
	if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
	if (!value.endsWith('/')) value += '/';
	return value;
}

/** Base64 of the UTF-8 bytes, so non-ASCII passwords survive the trip. */
function basicAuth(username: string, password: string): string {
	const bytes = new TextEncoder().encode(`${username}:${password}`);
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return `Basic ${btoa(binary)}`;
}

/** FNV-1a, hex — a stable fingerprint of a body when the server tells us nothing better. */
export function fingerprint(text: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i += 1) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return `h:${hash.toString(16).padStart(8, '0')}:${text.length}`;
}

export function createWebDavClient(config: WebDavConfig, fetchImpl: typeof fetch = fetch): SyncBackend {
	const base = normalizeWebDavUrl(config.url);
	const authorization = config.username ? basicAuth(config.username, config.password) : null;

	/** Body we hashed for a version, kept so `download` right after does not fetch twice. */
	let cached: { name: string; version: string; body: string } | null = null;
	let folderChecked = false;

	async function call(name: string, init: RequestInit): Promise<Response> {
		const headers = new Headers(init.headers ?? {});
		if (authorization) headers.set('Authorization', authorization);
		const response = await fetchImpl(base + name, { ...init, headers, credentials: 'omit' });
		if (response.status === 401 || response.status === 403) {
			throw new SyncAuthError('The WebDAV server rejected the username or password');
		}
		return response;
	}

	const fail = (response: Response, verb: string) =>
		new Error(`WebDAV ${verb} failed: ${response.status} ${response.statusText}`.trim());

	const versionFromHeaders = (response: Response): string | null => {
		const etag = response.headers.get('etag');
		if (etag) return `etag:${etag}`;
		const modified = response.headers.get('last-modified');
		return modified ? `mod:${modified}` : null;
	};

	/**
	 * Metadata for a file, or null when it does not exist. `knownBody` is what we just
	 * wrote, so a server that hides its headers still gets a version without a download.
	 */
	async function stat(name: string, knownBody?: string): Promise<RemoteFileMeta | null> {
		const head = await call(name, { method: 'HEAD' });
		if (head.status === 404) return null;
		if (!head.ok) throw fail(head, 'HEAD');

		const modifiedTime = head.headers.get('last-modified') ?? new Date().toISOString();
		let version = versionFromHeaders(head);
		if (!version) {
			const body = knownBody ?? (await read(name));
			version = fingerprint(body);
			cached = { name, version, body };
		}
		return { id: name, version, modifiedTime };
	}

	async function read(name: string): Promise<string> {
		const response = await call(name, { method: 'GET', headers: { Accept: '*/*' } });
		if (response.status === 404) throw new SyncMissingError('The WebDAV file is gone');
		if (!response.ok) throw fail(response, 'GET');
		return response.text();
	}

	async function write(name: string, mimeType: string, body: string): Promise<RemoteFileMeta> {
		let response = await call(name, { method: 'PUT', headers: { 'Content-Type': mimeType }, body });
		if (response.status === 409 && !folderChecked) {
			// 409 Conflict on PUT means the parent collection does not exist yet.
			await ensureFolder();
			response = await call(name, { method: 'PUT', headers: { 'Content-Type': mimeType }, body });
		}
		if (!response.ok) throw fail(response, 'PUT');
		folderChecked = true;

		const version = versionFromHeaders(response);
		if (version) {
			cached = null;
			return { id: name, version, modifiedTime: new Date().toISOString() };
		}
		const meta = await stat(name, body);
		if (!meta) throw new Error('WebDAV PUT succeeded but the file is not there afterwards');
		return meta;
	}

	async function ensureFolder() {
		const response = await call('', { method: 'MKCOL' });
		// 405 Method Not Allowed is what most servers say when the folder already exists.
		if (!response.ok && response.status !== 405) throw fail(response, 'MKCOL');
		folderChecked = true;
	}

	return {
		findFile: () => stat(WEBDAV_FILE_NAME),

		createFile: (json) => write(WEBDAV_FILE_NAME, 'application/json', json),

		getMeta: (fileId) => stat(fileId),

		async download(fileId) {
			if (cached && cached.name === fileId) {
				const { body } = cached;
				cached = null;
				return body;
			}
			return read(fileId);
		},

		upload: (fileId, json) => write(fileId, 'application/json', json),

		async putCompanion(_tag, name, mimeType, body) {
			await write(name, mimeType, body);
		}
	};
}

/** Human label for the connected account: `anna @ cloud.example.com`. */
export function describeWebDav(config: WebDavConfig): string {
	try {
		const host = new URL(normalizeWebDavUrl(config.url)).host;
		return config.username ? `${config.username} @ ${host}` : host;
	} catch {
		return config.url;
	}
}
