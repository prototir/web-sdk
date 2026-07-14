import {
	PROTOTIR_SOURCE,
	PROTOTIR_PROTOCOL_VERSION,
	isShellMessage,
	type PrototypeMessage,
	type AiProviderName
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

export interface PrototirAiCompleteOptions {
	provider: AiProviderName;
	prompt: string;
	/** Provider model id. Omit to use the platform's/registry's cheap default for the provider. */
	model?: string;
	maxTokens?: number;
	/** Override the default 30s timeout for this call. */
	timeoutMs?: number;
}

/** Machine-readable failure from a `Prototir.ai.complete()` call — e.g. "missing_user_key"
 * when the mode requires the player's own saved key and they haven't added one yet. */
export interface PrototirAiError {
	code: string;
	message: string;
}

export interface PrototirAi {
	/** Ask the shell to broker an LLM completion (§16), resolved per however this prototype's
	 * AiMode is configured (platform quota, creator's own key, or the calling player's own
	 * key). Rejects with a {@link PrototirAiError} on failure/timeout — never resolves to an
	 * empty string on error. */
	complete(options: PrototirAiCompleteOptions): Promise<string>;
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
	/** `Prototir.ai` (§16): a brokered LLM call, resolved per the prototype's configured AiMode. */
	ai: PrototirAi;
	/** Deterministic seeded RNG (D23 — a platform primitive, not a dependency): same seed →
	 * same sequence on every device, so daily challenges and leaderboard runs are fair.
	 * Returns a function yielding floats in [0, 1). Runs locally; nothing leaves the frame. */
	rng(seed?: string | number): () => number;
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

// ---- Prototir.ai plumbing: request/response over postMessage, matched by id ----
// Real network latency (unlike storage, which is fully client-side in the shell), so this
// gets its own, much longer default timeout and rejects with a machine-readable error
// instead of degrading to a null/empty value.

const AI_TIMEOUT_MS = 30000;
let nextAiId = 1;
const pendingAi = new Map<
	number,
	{ resolve: (text: string) => void; reject: (err: PrototirAiError) => void }
>();

if (typeof window !== 'undefined') {
	window.addEventListener('message', (e: MessageEvent) => {
		if (e.source !== window.parent || !isShellMessage(e.data)) return;
		if (e.data.type !== 'ai:result') return;
		const entry = pendingAi.get(e.data.id);
		if (!entry) return;
		pendingAi.delete(e.data.id);
		if (e.data.error) entry.reject(e.data.error);
		else entry.resolve(e.data.text ?? '');
	});
}

function aiRequest(options: PrototirAiCompleteOptions): Promise<string> {
	return new Promise((resolve, reject) => {
		if (typeof window === 'undefined' || window.parent === window) {
			reject({
				code: 'not_framed',
				message: 'Prototir.ai is only available when running inside the Prototir shell.'
			});
			return;
		}
		const id = nextAiId++;
		pendingAi.set(id, { resolve, reject });
		post({
			source: PROTOTIR_SOURCE,
			v: PROTOTIR_PROTOCOL_VERSION,
			type: 'ai',
			provider: options.provider,
			prompt: options.prompt,
			model: options.model,
			maxTokens: options.maxTokens,
			id
		});
		setTimeout(() => {
			if (pendingAi.delete(id)) {
				reject({ code: 'timeout', message: 'Prototir.ai request timed out.' });
			}
		}, options.timeoutMs ?? AI_TIMEOUT_MS);
	});
}

/** xmur3 string hash → four sfc32 seeds. Public-domain constructions (Bryc). */
function rng(seed: string | number = 'prototir'): () => number {
	const str = String(seed);
	let h = 1779033703 ^ str.length;
	for (let i = 0; i < str.length; i++) {
		h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
		h = (h << 13) | (h >>> 19);
	}
	const next = () => {
		h = Math.imul(h ^ (h >>> 16), 2246822507);
		h = Math.imul(h ^ (h >>> 13), 3266489909);
		return (h ^= h >>> 16) >>> 0;
	};
	let a = next(), b = next(), c = next(), d = next();
	return () => {
		a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
		let t = (a + b) | 0;
		a = b ^ (b >>> 9);
		b = (c + (c << 3)) | 0;
		c = (c << 21) | (c >>> 11);
		d = (d + 1) | 0;
		t = (t + d) | 0;
		c = (c + t) | 0;
		return (t >>> 0) / 4294967296;
	};
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
	rng,
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
	},
	ai: {
		async complete(options) {
			return aiRequest(options);
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
