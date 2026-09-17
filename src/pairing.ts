/**
 * Connects a build that has no browser session of its own to a Prototir account.
 *
 * A native game or a self-hosted page cannot host a sign-in: Google refuses OAuth inside embedded
 * webviews, so the only approach that works with every provider is to send the tester to a real
 * browser. The build shows a short code, the tester approves it on prototir.com, and the build
 * polls until a token comes back.
 *
 * The token is stored per prototype, so a tester approves once per machine rather than once per
 * comment.
 */

export interface PairingStart {
	code: string;
	verificationUrl: string;
	qrSvgDataUrl?: string;
	intervalSeconds: number;
	expiresInSeconds: number;
	prototypeTitle?: string;
}

export class PairingCancelled extends Error {
	constructor() {
		super('Pairing cancelled.');
	}
}

const STORAGE_PREFIX = 'prototir-pairing:';

/** Browser storage can be unavailable or throw outright, and a build that cannot remember a token
 * must still work: it simply asks again. */
export function storedToken(slug: string): string | null {
	try {
		return localStorage.getItem(STORAGE_PREFIX + slug);
	} catch {
		return null;
	}
}

export function storeToken(slug: string, token: string | null): void {
	try {
		if (token === null) localStorage.removeItem(STORAGE_PREFIX + slug);
		else localStorage.setItem(STORAGE_PREFIX + slug, token);
	} catch {
		/* A tester in a private window pairs again next time. */
	}
}

async function json(response: Response): Promise<Record<string, unknown>> {
	try {
		return (await response.json()) as Record<string, unknown>;
	} catch {
		return {};
	}
}

export async function startPairing(
	apiBase: string,
	slug: string,
	deviceLabel: string
): Promise<PairingStart> {
	const response = await fetch(`${apiBase}/prototypes/${encodeURIComponent(slug)}/pair`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ deviceLabel })
	});
	const body = await json(response);
	if (!response.ok) throw new Error(String(body.error ?? 'Could not start signing in.'));
	return body as unknown as PairingStart;
}

/**
 * Polls until the tester approves, then resolves with the build's token.
 *
 * Deliberately gives up rather than polling forever: an abandoned pairing that keeps hitting the
 * API from a game left running overnight is indistinguishable from abuse.
 */
export async function awaitApproval(
	apiBase: string,
	slug: string,
	start: PairingStart,
	signal: AbortSignal
): Promise<string> {
	const intervalMs = Math.max(1000, start.intervalSeconds * 1000);
	const deadline = Date.now() + Math.max(30, start.expiresInSeconds) * 1000;

	while (Date.now() < deadline) {
		if (signal.aborted) throw new PairingCancelled();
		await new Promise<void>((resolve, reject) => {
			const timer = setTimeout(resolve, intervalMs);
			signal.addEventListener(
				'abort',
				() => {
					clearTimeout(timer);
					reject(new PairingCancelled());
				},
				{ once: true }
			);
		});
		if (signal.aborted) throw new PairingCancelled();

		const response = await fetch(`${apiBase}/prototypes/${encodeURIComponent(slug)}/pair/poll`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ code: start.code }),
			signal
		});
		if (response.status === 202) continue;
		const body = await json(response);
		if (response.ok && typeof body.token === 'string') return body.token;
		// 410 means expired, unknown or already used - all unrecoverable, so stop rather than
		// hammer an endpoint that will never say yes.
		throw new Error(String(body.error ?? 'This sign-in expired. Try again.'));
	}
	throw new Error('This sign-in expired. Try again.');
}

/** Posts a screenshot comment with a paired build's token. */
export async function postComment(
	apiBase: string,
	slug: string,
	token: string,
	payload: unknown
): Promise<{ ok: boolean; revoked: boolean; error?: string }> {
	const response = await fetch(`${apiBase}/prototypes/${encodeURIComponent(slug)}/comments`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify(payload)
	});
	if (response.ok) return { ok: true, revoked: false };
	const body = await json(response);
	// A revoked or expired pairing is recoverable by pairing again, and is the one failure worth
	// distinguishing: everything else means the comment itself was refused.
	const revoked = response.status === 401 || response.status === 403;
	return { ok: false, revoked, error: String(body.error ?? 'Your comment was not posted.') };
}
