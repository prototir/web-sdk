/**
 * Resolves the Prototir host origin the embedded runtime may talk to.
 *
 * Hosts append `prototir_origin` to the frame URL. Engine exports that rewrite or
 * strip the query string carry it in the hash instead, so both forms are accepted.
 * Every embedded surface must agree on this, otherwise one goes silently offline.
 */
export function normalizeHttpOrigin(value: string): string {
	const url = new URL(value);
	if (url.protocol !== 'https:' && url.protocol !== 'http:') {
		throw new TypeError('Unsupported Prototir host origin.');
	}
	return url.origin;
}

/** Returns the normalized host origin, or `fallback` when none is usable. */
export function resolveHostOrigin<T extends string>(fallback: T): string | T {
	try {
		const url = new URL(window.location.href);
		const candidate =
			url.searchParams.get('prototir_origin') ??
			new URLSearchParams(url.hash.replace(/^#/, '')).get('prototir_origin');
		if (candidate) return normalizeHttpOrigin(candidate);
	} catch {
		// An opaque or malformed location cannot reveal the parent origin.
	}
	return fallback;
}
