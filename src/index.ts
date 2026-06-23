import {
	PROTOTIR_SOURCE,
	PROTOTIR_PROTOCOL_VERSION,
	type PrototypeMessage
} from './protocol';

/**
 * The public SDK a prototype calls to talk to the Prototir Shell. Available as the global
 * `window.Prototir` after including the script:
 *
 * ```html
 * <script src="https://cdn.prototir.com/sdk/v1/prototir.js"></script>
 * <script>
 *   Prototir.ready();
 *   Prototir.event('level_complete', { level: 2 });
 *   Prototir.score(1200);
 * </script>
 * ```
 */
export interface PrototirSdk {
	/** Signal the prototype is loaded and interactive (starts the real session). */
	ready(): void;
	/** Record a milestone/interaction (→ analytics / points). */
	event(name: string, data?: Record<string, unknown>): void;
	/** Report a score. */
	score(value: number): void;
}

/**
 * The Shell tells the prototype which origin to post to via a `prototir_origin` param on
 * the iframe URL (query or hash). The prototype runs as an opaque origin (sandbox without
 * allow-same-origin), so it cannot infer the parent origin otherwise. Falls back to '*'.
 */
function resolveTargetOrigin(): string {
	try {
		const url = new URL(window.location.href);
		const fromQuery = url.searchParams.get('prototir_origin');
		if (fromQuery) return fromQuery;
		const fromHash = new URLSearchParams(url.hash.replace(/^#/, '')).get('prototir_origin');
		if (fromHash) return fromHash;
	} catch {
		/* opaque/odd location — fall through */
	}
	return '*';
}

function post(message: PrototypeMessage): void {
	if (typeof window === 'undefined' || window.parent === window) return; // not framed
	window.parent.postMessage(message, resolveTargetOrigin());
}

export const Prototir: PrototirSdk = {
	ready() {
		post({ source: PROTOTIR_SOURCE, v: PROTOTIR_PROTOCOL_VERSION, type: 'ready' });
	},
	event(name, data) {
		post({ source: PROTOTIR_SOURCE, v: PROTOTIR_PROTOCOL_VERSION, type: 'event', name, data });
	},
	score(value) {
		post({ source: PROTOTIR_SOURCE, v: PROTOTIR_PROTOCOL_VERSION, type: 'score', value });
	}
};

declare global {
	interface Window {
		Prototir: PrototirSdk;
	}
}

if (typeof window !== 'undefined') {
	window.Prototir = Prototir;
}

export * from './protocol';
