/**
 * Telling a metered connection from Wi-Fi, as far as a web page can.
 *
 * Card art is nearly all of what Cardex downloads: about 30 KB a tile, so scrolling a
 * few hundred cards on mobile data costs megabytes, where the catalogue check (≈35 KB
 * every six hours) and a price (≈4 KB a card, kept half a day) barely register. Data
 * saver therefore mostly means "show the art this device already has, and fetch new
 * art only for the card you open".
 *
 * The browser says what it knows through the Network Information API, which only
 * Chromium implements: `type` is 'cellular' on Android's mobile data, and `saveData`
 * mirrors the system's own Data Saver switch. Safari and Firefox report neither, so on
 * an iPhone "auto" can never tell and the setting has to be switched on by hand —
 * `knowsNetworkType` is what lets the settings page say so.
 *
 * Pure apart from the `navigator` handed in, so it can be unit-tested.
 */
import type { DataSaverMode } from '$lib/prefs.svelte';

/** The slice of `navigator.connection` this module reads. */
export type ConnectionState = { type?: string; saveData?: boolean };

export type ConnectionInfo = EventTarget & ConnectionState;

export const connectionOf = (nav: Navigator | undefined): ConnectionInfo | undefined =>
	(nav as (Navigator & { connection?: ConnectionInfo }) | undefined)?.connection;

/** Why "auto" is saving right now, or null when it is not. */
export type MeteredReason = 'cellular' | 'save-data' | null;

export function meteredReason(connection: ConnectionState | undefined): MeteredReason {
	if (connection?.saveData) return 'save-data';
	if (connection?.type === 'cellular') return 'cellular';
	return null;
}

/**
 * Whether the browser says what kind of network it is on, so "auto" can follow the phone
 * off Wi-Fi. Desktop Chromium reports `saveData` but not `type`, Safari and Firefox
 * neither — there "auto" can only follow the system's own data saver, if that.
 */
export const knowsNetworkType = (connection: ConnectionState | undefined) =>
	connection?.type !== undefined;

export function shouldSaveData(mode: DataSaverMode, connection: ConnectionState | undefined) {
	if (mode === 'on') return true;
	if (mode === 'off') return false;
	return meteredReason(connection) !== null;
}
