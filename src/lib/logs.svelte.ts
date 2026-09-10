/**
 * Decompressed battle-log text, for components.
 *
 * Logs are stored gzipped (see tcg/battle-log/storage.ts) and unpacking is asynchronous,
 * but the pages that show them are plain synchronous `$derived` chains. This bridges the
 * two: ask for a log's text and you get `null` on the first read plus a decode kicked off
 * in the background; when it lands, the cache is Svelte state, so whatever asked re-runs
 * with the text in hand. A replay shows "reading" for one frame; a list of games fills its
 * turn counts in as they arrive, without a spinner per row.
 *
 * Cached by log id *and* `updatedAt`, so editing a log's text invalidates its entry rather
 * than replaying yesterday's game. Nothing here is persisted — it is a read-through cache
 * of data that already lives in the store.
 */
import type { BattleLog } from './data/model';
import { LogDecodeError, unpackLogText } from './tcg/battle-log/storage';

type Entry = { text: string | null; error: string | null };

const keyOf = (log: Pick<BattleLog, 'id' | 'updatedAt'>) => `${log.id}@${log.updatedAt}`;

class LogTexts {
	#entries = $state<Record<string, Entry>>({});
	/** Decodes already running, so a list of fifty rows starts fifty decodes and not more. */
	#inflight = new Set<string>();

	/**
	 * The log's text, or null while it is being read. Safe to call from a `$derived` — the
	 * decode it starts happens outside the current evaluation.
	 */
	text(log: Pick<BattleLog, 'id' | 'updatedAt' | 'text' | 'encoding'>): string | null {
		// A log written before compression, or one too short to be worth it, is already the
		// text — answered without touching the cache at all. Caching it would mean writing
		// state while a `$derived` is evaluating, which Svelte rightly refuses.
		if (log.encoding !== 'gzip') return log.text;

		const key = keyOf(log);
		const entry = this.#entries[key];
		if (entry) return entry.text;
		this.#start(key, log);
		return null;
	}

	/** Why a log could not be read, once it has failed. Null while it is still being tried. */
	error(log: Pick<BattleLog, 'id' | 'updatedAt'>): string | null {
		return this.#entries[keyOf(log)]?.error ?? null;
	}

	#start(key: string, log: Pick<BattleLog, 'text' | 'encoding'>) {
		if (this.#inflight.has(key)) return;
		this.#inflight.add(key);

		void unpackLogText(log)
			.then((text) => this.#put(key, { text, error: null }))
			.catch((error: unknown) => {
				const message =
					error instanceof LogDecodeError ? error.message : `Could not read this log: ${error}`;
				this.#put(key, { text: null, error: message });
			})
			.finally(() => this.#inflight.delete(key));
	}

	#put(key: string, entry: Entry) {
		this.#entries = { ...this.#entries, [key]: entry };
	}
}

export const logTexts = new LogTexts();
