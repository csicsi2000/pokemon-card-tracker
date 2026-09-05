import { manualInstall, type ManualInstall } from './install';

/** Chromium's non-standard event: the browser's own install prompt, deferred. */
interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** True when the page is running as an installed app rather than in a browser tab. */
function isStandalone(): boolean {
	return (
		window.matchMedia?.('(display-mode: standalone)').matches ||
		window.matchMedia?.('(display-mode: window-controls-overlay)').matches ||
		// iOS never reports a display-mode; it has its own flag.
		(navigator as Navigator & { standalone?: boolean }).standalone === true
	);
}

/**
 * Whether Cardex can be installed on this device, and how.
 *
 * Chromium fires `beforeinstallprompt` shortly after load; we hold on to it so the app
 * can offer its own button instead of relying on the browser's easily-missed address-bar
 * icon. Everywhere else the button opens the instructions from `manualInstall`.
 */
class InstallState {
	/** The deferred browser prompt, if this browser offered one. Usable exactly once. */
	#event = $state.raw<BeforeInstallPromptEvent | null>(null);
	/** Set once the prompt has been spent, so the button does not lie about a second try. */
	#spent = $state(false);
	/** Already running from the home screen or the dock. */
	installed = $state(false);
	/** Hand-install steps for this browser; read only when there is no prompt. */
	manual = $state.raw<ManualInstall | null>(null);

	/** True when clicking install opens the browser's own dialog. */
	get prompts() {
		return this.#event !== null;
	}

	/** Whether to offer installing at all. */
	get available() {
		if (this.installed) return false;
		return this.#event !== null || (!this.#spent && this.manual !== null);
	}

	/** Start listening. Call once from the root layout; returns a teardown. */
	listen() {
		this.installed = isStandalone();
		this.manual = manualInstall(navigator.userAgent, navigator.maxTouchPoints);

		const onBeforePrompt = (event: Event) => {
			// Without this Chrome shows its own mini-infobar and never gives us the event.
			event.preventDefault();
			this.#event = event as BeforeInstallPromptEvent;
			this.#spent = false;
		};
		const onInstalled = () => {
			this.installed = true;
			this.#event = null;
		};
		const display = window.matchMedia('(display-mode: standalone)');
		const onDisplayChange = () => (this.installed = isStandalone());

		window.addEventListener('beforeinstallprompt', onBeforePrompt);
		window.addEventListener('appinstalled', onInstalled);
		display.addEventListener('change', onDisplayChange);

		// Chromium only: this browser tab may belong to an already-installed copy, which
		// fires no prompt and reports no standalone display mode. Don't offer to install
		// a second time.
		const related = (
			navigator as Navigator & {
				getInstalledRelatedApps?: () => Promise<unknown[]>;
			}
		).getInstalledRelatedApps;
		void related
			?.call(navigator)
			.then((apps) => {
				if (apps.length > 0) this.installed = true;
			})
			.catch(() => {});

		return () => {
			window.removeEventListener('beforeinstallprompt', onBeforePrompt);
			window.removeEventListener('appinstalled', onInstalled);
			display.removeEventListener('change', onDisplayChange);
		};
	}

	/**
	 * Show the browser's install dialog. Resolves true if the user accepted, false if
	 * they declined or this browser has no dialog to show. The event cannot be reused,
	 * so it is dropped either way — Chromium fires a fresh one on a later visit.
	 */
	async prompt(): Promise<boolean> {
		const event = this.#event;
		if (!event) return false;
		this.#event = null;
		this.#spent = true;
		try {
			await event.prompt();
			const { outcome } = await event.userChoice;
			return outcome === 'accepted';
		} catch {
			return false;
		}
	}
}

export const install = new InstallState();
