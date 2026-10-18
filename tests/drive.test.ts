import { describe, expect, it } from 'vitest';
import { SyncAuthError, SyncMissingError } from '../src/lib/sync/backend';
import { createDriveClient } from '../src/lib/sync/drive';

/**
 * Drive says 403 both for "this sign-in may not do that" and for "you hit a limit". Only
 * the first is fixed by reconnecting; treating the second the same way parks the user in
 * an endless reconnect loop that never mentions the real cause.
 */

/** A Drive error body, in the shape the v3 API sends. */
const driveError = (status: number, reason: string, message = `${reason} happened`) =>
	new Response(
		JSON.stringify({ error: { code: status, message, errors: [{ domain: 'usageLimits', reason, message }] } }),
		{ status, headers: { 'content-type': 'application/json' } }
	);

const clientAnswering = (response: () => Response) =>
	createDriveClient(async () => 'token', (async () => response()) as typeof fetch);

describe('Drive client errors', () => {
	it('treats 401 as a rejected sign-in', async () => {
		const client = clientAnswering(() => new Response('', { status: 401 }));
		await expect(client.findFile()).rejects.toBeInstanceOf(SyncAuthError);
	});

	it.each(['insufficientPermissions', 'appNotAuthorizedToFile', 'insufficientFilePermissions'])(
		'treats a 403 for %s as a rejected sign-in',
		async (reason) => {
			const client = clientAnswering(() => driveError(403, reason));
			await expect(client.findFile()).rejects.toBeInstanceOf(SyncAuthError);
		}
	);

	it('keeps treating a 403 with no readable reason as a rejected sign-in', async () => {
		const client = clientAnswering(() => new Response('nope', { status: 403 }));
		await expect(client.findFile()).rejects.toBeInstanceOf(SyncAuthError);
	});

	it('says the Drive is full instead of asking to reconnect', async () => {
		const client = clientAnswering(() => driveError(403, 'storageQuotaExceeded'));
		const failure = client.createFile('{}');

		await expect(failure).rejects.not.toBeInstanceOf(SyncAuthError);
		await expect(failure).rejects.toThrow('Google Drive is full');
	});

	it.each(['userRateLimitExceeded', 'rateLimitExceeded'])(
		'reports a 403 for %s as a rate limit, not a sign-in problem',
		async (reason) => {
			const client = clientAnswering(() => driveError(403, reason));
			const failure = client.findFile();

			await expect(failure).rejects.not.toBeInstanceOf(SyncAuthError);
			await expect(failure).rejects.toThrow('slow down');
		}
	);

	it('passes Drive’s own message through for a 403 it does not recognise', async () => {
		const client = clientAnswering(() => driveError(403, 'domainPolicy', 'Your admin disabled Drive apps'));
		const failure = client.findFile();

		await expect(failure).rejects.not.toBeInstanceOf(SyncAuthError);
		await expect(failure).rejects.toThrow('Your admin disabled Drive apps');
	});

	it('still reads a 404 as a vanished file', async () => {
		const client = clientAnswering(() => new Response('', { status: 404 }));
		await expect(client.download('file-1')).rejects.toBeInstanceOf(SyncMissingError);
	});
});
