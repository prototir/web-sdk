import {
	PROTOTIR_SOURCE,
	PROTOTIR_PROTOCOL_VERSION,
	isShellMessage,
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
export interface PrototirStorage {
	/** Read a value persisted for this prototype (null when absent or shell unavailable). */
	get(key: string): Promise<string | null>;
	/** Persist a value for this prototype (shell-namespaced; size-capped by the shell). */
	set(key: string, value: string): Promise<void>;
	/** Remove a persisted value. */
	remove(key: string): Promise<void>;
}

export interface PrototirSdk {
	/** Signal the prototype is loaded and interactive (starts the real session). */
	ready(): void;
	/** Record a milestone/interaction (→ analytics / points). */
	event(name: string, data?: Record<string, unknown>): void;
	/** Report a score. */
	score(value: number): void;
	/** Per-prototype key-value persistence, brokered by the shell (D22). The sandboxed
	 * iframe has no reliable localStorage of its own. */
	storage: PrototirStorage;
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

// ---- storage plumbing: request/response over postMessage, matched by id ----

const STORAGE_TIMEOUT_MS = 3000;
let nextStorageId = 1;
const pending = new Map<number, (value: string | null) => void>();

if (typeof window !== 'undefined') {
	window.addEventListener('message', (e: MessageEvent) => {
		// Only accept replies from our parent (the shell).
		if (e.source !== window.parent || !isShellMessage(e.data)) return;
		if (e.data.type !== 'storage:result') return;
		const resolve = pending.get(e.data.id);
		if (resolve) {
			pending.delete(e.data.id);
			resolve(e.data.value ?? null);
		}
	});
}

function storageRequest(op: 'get' | 'set' | 'remove', key: string, value?: string): Promise<string | null> {
	return new Promise((resolve) => {
		if (typeof window === 'undefined' || window.parent === window) return resolve(null); // not framed
		const id = nextStorageId++;
		pending.set(id, resolve);
		post({ source: PROTOTIR_SOURCE, v: PROTOTIR_PROTOCOL_VERSION, type: 'storage', op, key, value, id });
		setTimeout(() => {
			if (pending.delete(id)) resolve(null); // shell absent or too old — degrade quietly
		}, STORAGE_TIMEOUT_MS);
	});
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
	},
	storage: {
		async get(key) {
			return storageRequest('get', key);
		},
		async set(key, value) {
			await storageRequest('set', key, value);
		},
		async remove(key) {
			await storageRequest('remove', key);
		}
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
