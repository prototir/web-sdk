import assert from 'node:assert/strict';
import { awaitApproval, PairingCancelled, postComment, startPairing } from '../dist/prototir.mjs';

const API = 'https://api.test';
const SLUG = 'probe';

/** Replaces fetch with a queue of canned responses, recording what was asked for. */
function stubFetch(responses) {
	const calls = [];
	globalThis.fetch = async (url, init) => {
		calls.push({ url: String(url), init });
		const next = responses.shift();
		if (!next) throw new Error('Unexpected extra fetch: ' + url);
		return {
			ok: next.status >= 200 && next.status < 300,
			status: next.status,
			json: async () => next.body ?? {}
		};
	};
	return calls;
}

const start = { code: 'ABCD-2345', verificationUrl: 'https://p/link', intervalSeconds: 0, expiresInSeconds: 30 };

// A pending pairing keeps polling; the token only arrives once the tester approves.
{
	stubFetch([
		{ status: 202 },
		{ status: 202 },
		{ status: 200, body: { token: 'tok-1' } }
	]);
	const token = await awaitApproval(API, SLUG, start, new AbortController().signal);
	assert.equal(token, 'tok-1');
}

// 410 is terminal: expired, unknown and already-used all land here, and retrying would only
// hammer an endpoint that will never say yes.
{
	stubFetch([{ status: 410, body: { error: 'This pairing code is no longer valid. Start again.' } }]);
	await assert.rejects(
		() => awaitApproval(API, SLUG, start, new AbortController().signal),
		/no longer valid/
	);
}

// Cancelling stops the loop rather than leaving a game polling overnight.
{
	stubFetch([{ status: 202 }]);
	const controller = new AbortController();
	controller.abort();
	await assert.rejects(
		() => awaitApproval(API, SLUG, start, controller.signal),
		(error) => error instanceof PairingCancelled
	);
}

// Giving up at the deadline, rather than leaving a game polling overnight. The expiry is floored
// at 30s in the client, so the clock is advanced rather than passing a nonsense value.
{
	stubFetch([{ status: 202 }, { status: 202 }, { status: 202 }, { status: 202 }]);
	const realNow = Date.now;
	let clock = realNow();
	Date.now = () => (clock += 20_000);
	try {
		await assert.rejects(
			() => awaitApproval(API, SLUG, start, new AbortController().signal),
			/expired/
		);
	} finally {
		Date.now = realNow;
	}
}

// A revoked pairing is the one failure the panel can recover from, so it must be distinguishable
// from an ordinary refusal.
{
	stubFetch([{ status: 403, body: { error: "This build's access was revoked. Pair it again." } }]);
	const result = await postComment(API, SLUG, 'tok', {});
	assert.equal(result.ok, false);
	assert.equal(result.revoked, true);
}
{
	stubFetch([{ status: 422, body: { error: 'your comment was held by moderation' } }]);
	const result = await postComment(API, SLUG, 'tok', {});
	assert.equal(result.ok, false);
	assert.equal(result.revoked, false, 'moderation is not a pairing problem and must not re-pair');
}

// The token travels as a bearer credential, and never in the URL where it would be logged.
{
	const calls = stubFetch([{ status: 200 }]);
	await postComment(API, SLUG, 'secret-token', { text: 'hi' });
	assert.equal(calls[0].init.headers.Authorization, 'Bearer secret-token');
	assert.ok(!calls[0].url.includes('secret-token'));
}

// A refused start surfaces the server's reason rather than a generic failure.
{
	stubFetch([{ status: 403, body: { error: 'Feedback is turned off for this prototype.' } }]);
	await assert.rejects(() => startPairing(API, SLUG, 'agent'), /turned off/);
}

console.log('Pairing: polling, expiry, cancellation, revocation, and token handling passed.');
