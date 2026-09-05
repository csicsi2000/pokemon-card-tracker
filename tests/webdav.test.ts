import { describe, expect, it } from 'vitest';
import type { UserData } from '../src/lib/data/model';
import { SyncAuthError } from '../src/lib/sync/backend';
import { SyncEngine, type SyncState } from '../src/lib/sync/engine';
import {
	createWebDavClient,
	describeWebDav,
	fingerprint,
	normalizeWebDavUrl,
	type WebDavConfig
} from '../src/lib/sync/webdav';
import { fixedClock, makeDeck, makeUserData } from './data-helpers';

type Options = {
	/** Whether the server exposes ETag / Last-Modified to the page (CORS permitting). */
	exposeHeaders?: boolean;
	/** Whether the folder exists before the first PUT. */
	folderExists?: boolean;
	/** Basic credentials the server accepts. */
	accept?: { username: string; password: string };
};

/**
 * A tiny in-memory WebDAV server behind a `fetch` shim: one collection, files keyed by
 * name, an ETag counter, and a log of every request so tests can assert on the traffic.
 */
function fakeServer(options: Options = {}) {
	const { exposeHeaders = true, folderExists = true } = options;
	const files = new Map<string, { body: string; etag: number; contentType: string }>();
	let folder = folderExists;
	let etagCounter = 0;
	const log: string[] = [];

	const expectedAuth = options.accept
		? `Basic ${Buffer.from(`${options.accept.username}:${options.accept.password}`).toString('base64')}`
		: null;

	const fetchImpl: typeof fetch = async (input, init = {}) => {
		const url = new URL(typeof input === 'string' ? input : (input as Request).url);
		const name = url.pathname.replace(/^\/dav\/cardex\/?/, '');
		const method = (init.method ?? 'GET').toUpperCase();
		log.push(`${method} ${name || '/'}`);

		const headers = new Headers(init.headers);
		if (expectedAuth && headers.get('authorization') !== expectedAuth) {
			return new Response('', { status: 401, statusText: 'Unauthorized' });
		}

		const headersFor = (file: { etag: number }): Record<string, string> =>
			exposeHeaders ? { ETag: `"${file.etag}"`, 'Last-Modified': 'Tue, 01 Sep 2026 10:00:00 GMT' } : {};

		if (method === 'MKCOL') {
			if (name) return new Response('', { status: 409 });
			if (folder) return new Response('', { status: 405, statusText: 'Method Not Allowed' });
			folder = true;
			return new Response('', { status: 201 });
		}
		if (method === 'HEAD') {
			const file = files.get(name);
			if (!file) return new Response('', { status: 404, statusText: 'Not Found' });
			return new Response(null, { status: 200, headers: headersFor(file) });
		}
		if (method === 'GET') {
			const file = files.get(name);
			if (!file) return new Response('', { status: 404, statusText: 'Not Found' });
			return new Response(file.body, { status: 200, headers: headersFor(file) });
		}
		if (method === 'PUT') {
			if (!folder) return new Response('', { status: 409, statusText: 'Conflict' });
			etagCounter += 1;
			const existed = files.has(name);
			const file = {
				body: String(init.body),
				etag: etagCounter,
				contentType: headers.get('content-type') ?? ''
			};
			files.set(name, file);
			return new Response(null, { status: existed ? 204 : 201, headers: headersFor(file) });
		}
		return new Response('', { status: 405 });
	};

	return { fetchImpl, files, log, get folder() { return folder; } };
}

const config: WebDavConfig = { url: 'https://nas.local/dav/cardex/', username: 'anna', password: 'pw' };

describe('WebDAV client', () => {
	it('normalises the folder URL', () => {
		expect(normalizeWebDavUrl(' nas.local/dav/cardex ')).toBe('https://nas.local/dav/cardex/');
		expect(normalizeWebDavUrl('http://x/y/')).toBe('http://x/y/');
		expect(normalizeWebDavUrl('')).toBe('');
		expect(describeWebDav(config)).toBe('anna @ nas.local');
	});

	it('finds nothing, creates the file with basic auth, then finds it by ETag', async () => {
		const server = fakeServer({ accept: { username: 'anna', password: 'pw' } });
		const client = createWebDavClient(config, server.fetchImpl);

		expect(await client.findFile()).toBeNull();

		const created = await client.createFile('{"a":1}');
		expect(created).toMatchObject({ id: 'cardex-data.json', version: 'etag:"1"' });
		expect(server.files.get('cardex-data.json')).toMatchObject({
			body: '{"a":1}',
			contentType: 'application/json'
		});

		const found = await client.findFile();
		expect(found?.version).toBe('etag:"1"');
		expect(await client.download('cardex-data.json')).toBe('{"a":1}');

		const uploaded = await client.upload('cardex-data.json', '{"a":2}');
		expect(uploaded.version).toBe('etag:"2"');
		expect(await client.getMeta('cardex-data.json')).toMatchObject({ version: 'etag:"2"' });
		expect(await client.getMeta('nope.json')).toBeNull();
	});

	it('creates the folder when the first PUT reports a missing parent', async () => {
		const server = fakeServer({ folderExists: false });
		const client = createWebDavClient(config, server.fetchImpl);

		await client.createFile('{}');

		expect(server.folder).toBe(true);
		expect(server.log).toEqual([
			'PUT cardex-data.json',
			'MKCOL /',
			'PUT cardex-data.json'
		]);
	});

	it('falls back to hashing the content when the server hides its headers', async () => {
		const server = fakeServer({ exposeHeaders: false });
		const client = createWebDavClient(config, server.fetchImpl);

		const created = await client.createFile('{"a":1}');
		expect(created.version).toBe(fingerprint('{"a":1}'));
		// The version after a PUT comes from the body we just sent — no download needed.
		expect(server.log.filter((line) => line.startsWith('GET'))).toEqual([]);

		server.log.length = 0;
		const meta = await client.getMeta('cardex-data.json');
		expect(meta?.version).toBe(fingerprint('{"a":1}'));
		// The stat had to GET the body to hash it; the download right after reuses it.
		expect(await client.download('cardex-data.json')).toBe('{"a":1}');
		expect(server.log).toEqual(['HEAD cardex-data.json', 'GET cardex-data.json']);

		server.files.set('cardex-data.json', { body: '{"a":2}', etag: 9, contentType: '' });
		expect((await client.getMeta('cardex-data.json'))?.version).toBe(fingerprint('{"a":2}'));
	});

	it('turns 401 into an auth error the engine parks on', async () => {
		const server = fakeServer({ accept: { username: 'anna', password: 'right' } });
		const client = createWebDavClient({ ...config, password: 'wrong' }, server.fetchImpl);

		await expect(client.findFile()).rejects.toBeInstanceOf(SyncAuthError);
	});

	it('writes the readable companion as a plain file next to the data', async () => {
		const server = fakeServer();
		const client = createWebDavClient(config, server.fetchImpl);

		await client.putCompanion('readable', 'cardex-readable.md', 'text/markdown', '# hi');

		expect(server.files.get('cardex-readable.md')).toMatchObject({ body: '# hi', contentType: 'text/markdown' });
	});

	it('syncs two devices through a WebDAV folder end to end', async () => {
		const server = fakeServer({ exposeHeaders: false }); // the harder case
		const device = (initial: UserData) => {
			let local = initial;
			let state: SyncState | null = null;
			const clock = fixedClock('2026-03-01T00:00:00.000Z');
			const engine = new SyncEngine({
				backend: createWebDavClient(config, server.fetchImpl),
				loadLocal: () => local,
				saveLocal: (data) => (local = data),
				loadState: () => state,
				saveState: (next) => (state = next),
				now: () => clock.next(),
				renderReadable: (data) => `# ${data.decks.length} decks`
			});
			return { engine, get local() { return local; }, get state() { return state; } };
		};

		const a = device(makeUserData({ decks: [makeDeck({ id: 'a-deck' })] }));
		const b = device(makeUserData({ decks: [makeDeck({ id: 'b-deck' })] }));

		await a.engine.sync();
		expect(a.engine.status).toBe('idle');
		expect(a.state?.fileId).toBe('cardex-data.json');

		await b.engine.sync();
		expect(b.local.decks.map((d) => d.id).sort()).toEqual(['a-deck', 'b-deck']);

		await a.engine.sync();
		expect(a.local.decks.map((d) => d.id).sort()).toEqual(['a-deck', 'b-deck']);
		expect(server.files.get('cardex-readable.md')?.body).toBe('# 2 decks');
	});
});
