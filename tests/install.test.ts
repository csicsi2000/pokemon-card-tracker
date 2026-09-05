import { describe, expect, it } from 'vitest';
import { manualInstall } from '../src/lib/pwa/install';

const UA = {
	iphoneSafari:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
	iphoneChrome:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
	iphoneFirefox:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',
	ipadOS:
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
	macSafari:
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
	desktopFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
	desktopChrome:
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
};

describe('manualInstall', () => {
	it('sends iPhone Safari to the share sheet', () => {
		const help = manualInstall(UA.iphoneSafari);
		expect(help.browser).toContain('Safari');
		expect(help.possible).toBe(true);
		expect(help.steps.join(' ')).toContain('Add to Home Screen');
	});

	it('names the iOS browser the user is actually in', () => {
		expect(manualInstall(UA.iphoneChrome).browser).toContain('Chrome');
		expect(manualInstall(UA.iphoneFirefox).browser).toContain('Firefox');
	});

	// An iPad on iPadOS 13+ claims to be a Mac; only the touch points give it away.
	it('separates an iPad from a Mac', () => {
		expect(manualInstall(UA.ipadOS, 5).browser).toContain('iPhone / iPad');
		expect(manualInstall(UA.macSafari, 0).browser).toBe('Safari on Mac');
	});

	it('sends desktop Safari to the File menu', () => {
		expect(manualInstall(UA.macSafari).steps.join(' ')).toContain('Add to Dock');
	});

	it('admits that desktop Firefox cannot install web apps', () => {
		const help = manualInstall(UA.desktopFirefox);
		expect(help.possible).toBe(false);
	});

	// Chromium normally never reaches this helper, but if it does the advice must still
	// point somewhere real rather than at an iOS share sheet.
	it('falls back to the browser menu elsewhere', () => {
		const help = manualInstall(UA.desktopChrome);
		expect(help.possible).toBe(true);
		expect(help.steps.join(' ')).toContain('Install');
	});
});
