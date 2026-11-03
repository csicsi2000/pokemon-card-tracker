/**
 * The live answer to "should this page hold back on the network?" — the preference in
 * `prefs`, combined with what the connection is doing now. Chromium fires `change` on
 * `navigator.connection` when the phone moves between Wi-Fi and mobile data, so an open
 * page follows along without a reload.
 */
import { browser } from '$app/environment';
import { prefs } from '$lib/prefs.svelte';
import {
	connectionOf,
	knowsNetworkType,
	meteredReason,
	shouldSaveData,
	type ConnectionState,
	type MeteredReason
} from './data-saver';

class DataSaver {
	/** A copy of the connection, re-read on every `change` so runes can track it. */
	#connection = $state<ConnectionState | undefined>(undefined);

	/** Call once on the client; returns the teardown. */
	listen(): () => void {
		const connection = browser ? connectionOf(navigator) : undefined;
		if (!connection) return () => {};
		const read = () =>
			(this.#connection = { type: connection.type, saveData: connection.saveData });
		read();
		connection.addEventListener('change', read);
		return () => connection.removeEventListener('change', read);
	}

	/** True while art, prices and the catalogue check should stay off the network. */
	get active(): boolean {
		return shouldSaveData(prefs.dataSaver, this.#connection);
	}

	/** What "auto" is reacting to right now; null on Wi-Fi or when the browser cannot say. */
	get reason(): MeteredReason {
		return meteredReason(this.#connection);
	}

	/** True only where "auto" can see the phone leave Wi-Fi — Chrome on Android. */
	get detectable(): boolean {
		return knowsNetworkType(this.#connection);
	}
}

export const dataSaver = new DataSaver();
