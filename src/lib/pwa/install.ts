/**
 * Install instructions for browsers that never fire `beforeinstallprompt`.
 *
 * Chromium (Chrome, Edge, Brave, Samsung Internet, …) hands the page an event it can
 * defer and fire from a button of our own. Everyone else installs by hand through a
 * menu, so all we can do is say which menu. Pure so it can be unit-tested.
 */
export type ManualInstall = {
	/** How to name the browser back to the user. */
	browser: string;
	/** Ordered steps, or a single line explaining why there is nothing to do. */
	steps: string[];
	/** False when the browser cannot install web apps at all. */
	possible: boolean;
};

const IOS_SHARE = 'Tap the Share button (the square with an arrow)';

/**
 * What to tell the user when the browser gave us no install prompt.
 *
 * `maxTouchPoints` separates an iPad on iPadOS 13+ — which claims to be a Mac — from a
 * real desktop Safari; the two install web apps through different menus.
 */
export function manualInstall(userAgent: string, maxTouchPoints = 0): ManualInstall {
	const ua = userAgent;
	const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1);

	if (ios) {
		// Every iOS browser is WebKit underneath and installs through the share sheet;
		// only the route to that sheet differs.
		if (/FxiOS/i.test(ua)) {
			return {
				browser: 'Firefox on iPhone / iPad',
				possible: true,
				steps: [
					'Open the ••• menu in the toolbar',
					'Choose Share',
					'Choose "Add to Home Screen", then Add'
				]
			};
		}
		if (/CriOS|EdgiOS/i.test(ua)) {
			return {
				browser: /EdgiOS/i.test(ua) ? 'Edge on iPhone / iPad' : 'Chrome on iPhone / iPad',
				possible: true,
				steps: [IOS_SHARE, 'Choose "Add to Home Screen", then Add']
			};
		}
		return {
			browser: 'Safari on iPhone / iPad',
			possible: true,
			steps: [
				IOS_SHARE + ' at the bottom of the screen',
				'Scroll down and choose "Add to Home Screen"',
				'Tap Add — Cardex then opens like any other app'
			]
		};
	}

	if (/Firefox\//i.test(ua)) {
		return {
			browser: 'Firefox',
			possible: false,
			steps: [
				'Firefox on the desktop cannot install web apps.',
				'Open Cardex in Chrome, Edge or Safari to install it — or just bookmark this page. It works offline in Firefox either way.'
			]
		};
	}

	// Desktop Safari: not Chromium, not Firefox, but says Safari.
	if (/Safari\//i.test(ua) && !/Chrom(e|ium)|Edg\//i.test(ua)) {
		return {
			browser: 'Safari on Mac',
			possible: true,
			steps: ['Open the File menu', 'Choose "Add to Dock…"', 'Confirm with Add']
		};
	}

	return {
		browser: 'this browser',
		possible: true,
		steps: [
			'Look for an install icon in the address bar, or an "Install" / "Add to Home Screen" entry in the browser menu.'
		]
	};
}
