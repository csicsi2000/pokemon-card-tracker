/**
 * File-system plumbing shared by the CLI and the MCP server: where the data file is,
 * how to read and write it safely, and how to load the bundled catalogue.
 *
 * The data file is the same JSON the app keeps in localStorage and syncs to Google Drive.
 * Point CARDEX_DATA (or --file) at a backup you exported from Import / Export → Backup, or
 * at the `Cardex/cardex-data.json` that Google Drive for Desktop mirrors to disk — then
 * edits made here flow into the app on its next sync.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CatalogueFile } from '../src/lib/catalogue-format';
import { buildCatalogue, type Catalogue } from '../src/lib/catalogue-index';
import { createClock, type Clock } from '../src/lib/data/clock';
import { migrate } from '../src/lib/data/migrate';
import { emptyData, type UserData } from '../src/lib/data/model';
import { repair } from '../src/lib/data/repair';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function resolveDataPath(explicit?: string | null): string {
	const candidate = explicit ?? process.env.CARDEX_DATA ?? 'cardex-data.json';
	return resolve(process.cwd(), candidate);
}

let catalogue: Catalogue | null = null;

export function loadCatalogueFromDisk(root = REPO_ROOT): Catalogue {
	if (catalogue) return catalogue;
	const path = resolve(root, 'static/catalogue.json');
	if (!existsSync(path)) {
		throw new Error(`Catalogue not found at ${path}. Run "npm run build:catalogue" first.`);
	}
	catalogue = buildCatalogue(JSON.parse(readFileSync(path, 'utf8')) as CatalogueFile);
	return catalogue;
}

export type DataFile = { path: string; data: UserData; clock: Clock; existed: boolean };

/** Read the data file (any version); a missing file is an empty collection, not an error. */
export function openData(path: string): DataFile {
	const clock = createClock();
	if (!existsSync(path)) return { path, data: emptyData(), clock, existed: false };
	const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
	const data = repair(migrate(raw), { now: new Date().toISOString() });
	clock.observe(data);
	return { path, data, clock, existed: true };
}

/** Atomic write: a crash mid-write cannot leave a half-written collection behind. */
export function saveData(path: string, data: UserData) {
	mkdirSync(dirname(path), { recursive: true });
	const tmp = `${path}.tmp-${process.pid}`;
	writeFileSync(tmp, JSON.stringify(data, null, '\t') + '\n', 'utf8');
	renameSync(tmp, path);
}
