import { review } from './review';
import { resolveHostOrigin } from './host-origin';
export * from './review-document';
export * from './theme';
export * from './pairing';
export type { ReviewOptions } from './review';
import {
	PROTOTIR_SOURCE,
	PROTOTIR_PROTOCOL_VERSION,
	isShellMessage,
	type PrototypeMessage
} from './protocol';

/** Options for provider-neutral managed text generation. */
export interface PrototirAiGenerateOptions {
	prompt: string;
	/** Maximum output tokens. Prototir may lower this to fit request and allowance limits. */
	maxTokens?: number;
	/** Override the default 30-second timeout for this call. */
	timeoutMs?: number;
}

/** A machine-readable failure returned by a managed service. */
export interface PrototirAiError {
	code: string;
	message: string;
}

export interface PrototirStorage {
	/** Read a value persisted for this prototype, or null when absent or unavailable. */
	get(key: string): Promise<string | null>;
	/** Persist a string for this prototype. */
	set(key: string, value: string): Promise<void>;
	/** Remove a persisted value. */
	remove(key: string): Promise<void>;
}

export interface PrototirAi {
	/** Generate text through Prototir's managed gateway. */
	generate(options: PrototirAiGenerateOptions): Promise<string>;
	/** @deprecated Use {@link generate}. */
	complete(options: PrototirAiGenerateOptions): Promise<string>;
}

export interface PrototirSdk {
 review: typeof review;
	/** Signal that the prototype is loaded and genuinely interactive. */
	ready(): void;
	/** Record a stable analytics event with an optional small, non-personal payload. */
	event(name: string, data?: Record<string, unknown>): void;
	/** Report the current finite numeric score. */
	score(value: number): void;
	/** Per-prototype key-value persistence brokered by the Prototir player shell. */
	storage: PrototirStorage;
	/** Provider-neutral managed text generation brokered by the Prototir player shell. */
	ai: PrototirAi;
	/** Return a deterministic random-number function yielding values in [0, 1). */
	rng(seed?: string | number): () => number;
}

const STORAGE_TIMEOUT_MS = 3000;
const AI_TIMEOUT_MS = 30000;
const MAX_EVENT_NAME_LENGTH = 64;
const MAX_STORAGE_KEY_LENGTH = 128;
const MAX_STORAGE_VALUE_BYTES = 64 * 1024;
const EVENT_NAME_PATTERN = /^[a-z0-9_.:-]+$/;

let nextStorageId = 1;
let nextAiId = 1;

const pendingStorage = new Map<
	number,
	{ resolve: (value: string | null) => void; timer: ReturnType<typeof setTimeout> }
>();
const pendingAi = new Map<
	number,
	{
		resolve: (text: string) => void;
		reject: (error: PrototirAiError) => void;
		timer: ReturnType<typeof setTimeout>;
	}
>();

function resolveTargetOrigin(): string {
	return resolveHostOrigin('*');
}

function post(message: PrototypeMessage): void {
	if (typeof window === 'undefined' || window.parent === window) return;
	window.parent.postMessage(message, resolveTargetOrigin());
}

function allocateRequestId(channel: 'storage' | 'ai'): number {
	if (channel === 'storage') {
		if (nextStorageId >= Number.MAX_SAFE_INTEGER) nextStorageId = 1;
		return nextStorageId++;
	}
	if (nextAiId >= Number.MAX_SAFE_INTEGER) nextAiId = 1;
	return nextAiId++;
}

function normalizeEventName(name: string): string {
	const normalized = String(name ?? '').trim().toLowerCase();
	if (!normalized || normalized.length > MAX_EVENT_NAME_LENGTH || !EVENT_NAME_PATTERN.test(normalized)) {
		throw new TypeError(
			'Event names must be 1-64 characters using lowercase letters, numbers, underscore, dot, colon, or hyphen.'
		);
	}
	return normalized;
}

function validateStorageKey(key: string): string {
	const normalized = String(key ?? '').trim();
	if (!normalized || normalized.length > MAX_STORAGE_KEY_LENGTH) {
		throw new TypeError('Storage keys must contain 1-128 characters.');
	}
	return normalized;
}

function validateStorageValue(value: string): string {
	const normalized = String(value ?? '');
	if (new TextEncoder().encode(normalized).byteLength > MAX_STORAGE_VALUE_BYTES) {
		throw new RangeError('Storage values cannot exceed 64 KiB of UTF-8 data.');
	}
	return normalized;
}

if (typeof window !== 'undefined') {
	window.addEventListener('message', (event: MessageEvent) => {
		if (event.source !== window.parent || !isShellMessage(event.data)) return;

		if (event.data.type === 'storage:result') {
			const entry = pendingStorage.get(event.data.id);
			if (!entry) return;
			pendingStorage.delete(event.data.id);
			clearTimeout(entry.timer);
			entry.resolve(event.data.value ?? null);
			return;
		}

		if (event.data.type === 'ai:result') {
			const entry = pendingAi.get(event.data.id);
			if (!entry) return;
			pendingAi.delete(event.data.id);
			clearTimeout(entry.timer);
			if (event.data.error) entry.reject(event.data.error);
			else if (event.data.text) entry.resolve(event.data.text);
			else entry.reject({ code: 'empty_response', message: 'Prototir.ai returned an empty response.' });
		}
	});
}

function storageRequest(
	op: 'get' | 'set' | 'remove',
	key: string,
	value?: string
): Promise<string | null> {
	const normalizedKey = validateStorageKey(key);
	const normalizedValue = value === undefined ? undefined : validateStorageValue(value);

	return new Promise((resolve) => {
		if (typeof window === 'undefined' || window.parent === window) {
			resolve(null);
			return;
		}

		const id = allocateRequestId('storage');
		const timer = setTimeout(() => {
			if (pendingStorage.delete(id)) resolve(null);
		}, STORAGE_TIMEOUT_MS);
		pendingStorage.set(id, { resolve, timer });
		post({
			source: PROTOTIR_SOURCE,
			v: PROTOTIR_PROTOCOL_VERSION,
			type: 'storage',
			op,
			key: normalizedKey,
			value: normalizedValue,
			id
		});
	});
}

function validationError(code: string, message: string): Promise<never> {
	return Promise.reject({ code, message } satisfies PrototirAiError);
}

function aiRequest(options: PrototirAiGenerateOptions): Promise<string> {
	if (!options || typeof options.prompt !== 'string' || !options.prompt.trim()) {
		return validationError('invalid_prompt', 'AI prompt is required.');
	}
	if (options.maxTokens !== undefined && (!Number.isInteger(options.maxTokens) || options.maxTokens < 0)) {
		return validationError('invalid_max_tokens', 'maxTokens must be a non-negative integer.');
	}
	if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)) {
		return validationError('invalid_timeout', 'timeoutMs must be greater than zero.');
	}

	return new Promise((resolve, reject) => {
		if (typeof window === 'undefined' || window.parent === window) {
			reject({
				code: 'not_framed',
				message: 'Prototir.ai is only available when running inside the Prototir player.'
			});
			return;
		}

		const id = allocateRequestId('ai');
		const timer = setTimeout(() => {
			if (pendingAi.delete(id)) {
				reject({ code: 'timeout', message: 'Prototir.ai request timed out.' });
			}
		}, options.timeoutMs ?? AI_TIMEOUT_MS);
		pendingAi.set(id, { resolve, reject, timer });
		post({
			source: PROTOTIR_SOURCE,
			v: PROTOTIR_PROTOCOL_VERSION,
			type: 'ai',
			prompt: options.prompt,
			maxTokens: options.maxTokens,
			id
		});
	});
}

/** Deterministic xmur3/sfc32-style random number generator. */
function rng(seed: string | number = 'prototir'): () => number {
	const value = String(seed);
	let hash = 1779033703 ^ value.length;
	for (let index = 0; index < value.length; index++) {
		hash = Math.imul(hash ^ value.charCodeAt(index), 3432918353);
		hash = (hash << 13) | (hash >>> 19);
	}
	const nextSeed = () => {
		hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
		hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
		return (hash ^= hash >>> 16) >>> 0;
	};
	let a = nextSeed();
	let b = nextSeed();
	let c = nextSeed();
	let d = nextSeed();
	return () => {
		a >>>= 0;
		b >>>= 0;
		c >>>= 0;
		d >>>= 0;
		let result = (a + b) | 0;
		a = b ^ (b >>> 9);
		b = (c + (c << 3)) | 0;
		c = (c << 21) | (c >>> 11);
		d = (d + 1) | 0;
		result = (result + d) | 0;
		c = (c + result) | 0;
		return (result >>> 0) / 4294967296;
	};
}

export const Prototir: PrototirSdk = {
 review,
	ready() {
		post({ source: PROTOTIR_SOURCE, v: PROTOTIR_PROTOCOL_VERSION, type: 'ready' });
	},
	event(name, data) {
		post({
			source: PROTOTIR_SOURCE,
			v: PROTOTIR_PROTOCOL_VERSION,
			type: 'event',
			name: normalizeEventName(name),
			data
		});
	},
	score(value) {
		if (!Number.isFinite(value)) throw new TypeError('Score must be a finite number.');
		post({ source: PROTOTIR_SOURCE, v: PROTOTIR_PROTOCOL_VERSION, type: 'score', value });
	},
	rng,
	storage: {
		get(key) {
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
		generate(options) {
			return aiRequest(options);
		},
		complete(options) {
			return aiRequest(options);
		}
	}
};

declare global {
	interface Window {
		Prototir: PrototirSdk;
	}
}

if (typeof window !== 'undefined') window.Prototir = Prototir;

export * from './protocol';
