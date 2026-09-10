/**
 * Battle logs at rest.
 *
 * A single game is about 25,000 characters of text, and localStorage bills UTF-16 — so an
 * uncompressed log costs roughly 49 KB of a 5 MB budget, and the same text rides in every
 * sync of the whole payload. A hundred games would fill the browser's storage on their own.
 *
 * Gzipping the text and base64-ing the bytes takes that 49 KB to 6 KB, and the synced JSON
 * from 25 KB to 3 KB — about 87% off, measured on a real 15-turn game. A whole-line
 * dictionary (the obvious dependency-free trick, since a third of a log is a stadium
 * ability firing over and over) only manages half that, which is why this uses the
 * platform's compressor instead of hand-rolling one.
 *
 * The catch is that CompressionStream is asynchronous, so packing and unpacking cannot
 * happen inside the pure reducers in data/mutations.ts. They happen at the call site
 * instead: a log arrives here already packed, and the UI reads it back through the cache in
 * lib/logs.svelte.ts. Everything degrades to plain text when the browser has no
 * CompressionStream, when the text is too short to be worth it, or when compressing would
 * not actually save anything.
 */
import type { BattleLog, LogEncoding } from '$lib/data/model';

/** Below this, the base64 overhead eats the win and the saving is not worth a format. */
const WORTH_COMPRESSING = 512;

/**
 * A paste longer than this is a mistake rather than a game — a long match is about 25,000
 * characters. Capped here, on the way in, because it is the one funnel every write passes
 * through and the only place the *original* text is still in hand: the reducers store
 * base64 by then, and slicing that would destroy the log rather than shorten it.
 */
export const MAX_BATTLE_LOG_CHARS = 200_000;

/** Chunked, because String.fromCharCode(...bigArray) overflows the call stack. */
function toBase64(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i += 8192) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
	}
	return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

async function through(bytes: Uint8Array, transform: ReadableWritablePair): Promise<Uint8Array> {
	const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(transform);
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** True when this runtime can compress. Node 18+ and every browser since 2023 can. */
export const canCompressLogs = () =>
	typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

export type PackedLog = { text: string; encoding: LogEncoding };

/**
 * The stored form of a log's text. Falls back to plain whenever compression is impossible
 * or pointless, so `encoding` describes what actually happened rather than what was wanted.
 */
export async function packLogText(text: string): Promise<PackedLog> {
	const trimmed = text.trim().slice(0, MAX_BATTLE_LOG_CHARS);
	if (trimmed.length < WORTH_COMPRESSING || !canCompressLogs()) {
		return { text: trimmed, encoding: 'plain' };
	}

	try {
		const bytes = new TextEncoder().encode(trimmed);
		const packed = toBase64(await through(bytes, new CompressionStream('gzip')));
		// A log that grew (already-compressed noise, or a very short one) stays as it was.
		return packed.length < trimmed.length ? { text: packed, encoding: 'gzip' } : { text: trimmed, encoding: 'plain' };
	} catch {
		// Compression is an optimisation; failing it must never cost the user their log.
		return { text: trimmed, encoding: 'plain' };
	}
}

export class LogDecodeError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'LogDecodeError';
	}
}

/** The text back out of a stored log. Throws only when a gzip log cannot be read at all. */
export async function unpackLogText(log: Pick<BattleLog, 'text' | 'encoding'>): Promise<string> {
	if (log.encoding !== 'gzip') return log.text;
	if (!canCompressLogs()) {
		throw new LogDecodeError('This browser cannot read compressed logs (no DecompressionStream).');
	}
	try {
		const bytes = await through(fromBase64(log.text), new DecompressionStream('gzip'));
		return new TextDecoder().decode(bytes);
	} catch (error) {
		throw new LogDecodeError(`This log could not be decompressed: ${(error as Error).message}`);
	}
}

/**
 * What a stored log costs, in characters — the number both localStorage and the synced file
 * scale with. Used to show the user where their storage went.
 */
export const storedSize = (log: Pick<BattleLog, 'text'>) => log.text.length;
