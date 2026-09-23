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

/**
 * The prototype this frame is showing, when the host said so.
 *
 * Travels the same two ways as `prototir_origin`, for the same reason: some engine exports
 * rewrite or strip the query string, so the hash is accepted too.
 *
 * This exists so a creator who adds the SDK gets feedback without configuring anything. The
 * prototype's identity is the host's to know, not the build's: the slug does not exist until the
 * prototype does, which is the same reason it is injected into downloadable builds at upload.
 */
export function resolveHostProject(): string | null {
	try {
		const url = new URL(window.location.href);
		const candidate =
			url.searchParams.get('prototir_slug') ??
			new URLSearchParams(url.hash.replace(/^#/, '')).get('prototir_slug');
		if (!candidate) return null;
		// Same bound `enable()` enforces, applied here so a hostile or broken host cannot make the
		// SDK throw during its own start-up.
		const slug = candidate.trim();
		return slug.length > 0 && slug.length <= 120 ? slug : null;
	} catch {
		return null;
	}
}
