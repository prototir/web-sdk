/**
 * Prototir player postMessage protocol — the contract between a prototype (running in a
 * sandboxed iframe) and the Prototir Shell (parent frame on the app origin).
 *
 * This file is the source of truth. The webapp shell keeps a small vendored copy; keep
 * the two in sync when bumping {@link PROTOTIR_PROTOCOL_VERSION}.
 */

export const PROTOTIR_SOURCE = 'prototir' as const;
export const PROTOTIR_PROTOCOL_VERSION = 1 as const;

interface Envelope {
	source: typeof PROTOTIR_SOURCE;
	v: typeof PROTOTIR_PROTOCOL_VERSION;
}

// ---- Prototype → Shell ----

/** The prototype has loaded and is interactive; starts the real session. */
export interface ReadyMessage extends Envelope {
	type: 'ready';
}

/** A milestone or interaction worth recording (analytics / points). */
export interface EventMessage extends Envelope {
	type: 'event';
	name: string;
	data?: Record<string, unknown>;
}

/** An optional score update. */
export interface ScoreMessage extends Envelope {
	type: 'score';
	value: number;
}

/** Per-prototype key-value persistence, brokered by the shell (D22 `Prototir.storage`).
 * Opaque-origin iframes have no reliable localStorage; the shell stores values namespaced
 * per prototype and answers with a StorageResultMessage carrying the same request id. */
export interface StorageMessage extends Envelope {
	type: 'storage';
	op: 'get' | 'set' | 'remove';
	key: string;
	value?: string;
	id: number;
}

/** LLM provider for a `Prototir.ai` call (§16). `llama` has no first-party public inference
 * API — the shell routes it through Groq's OpenAI-compatible endpoint under the hood. */
export type AiProviderName = 'anthropic' | 'openai' | 'google' | 'mistral' | 'xai' | 'llama';

/** A `Prototir.ai.complete()` call, brokered by the shell: sandbox → shell → webapp server
 * route → prototir-api, which resolves the actual key (platform quota, creator's own, or the
 * calling player's own) and calls the provider. Real network latency unlike storage — gets
 * its own longer timeout in index.ts rather than storage's 3s. */
export interface AiMessage extends Envelope {
	type: 'ai';
	provider: AiProviderName;
	prompt: string;
	model?: string;
	maxTokens?: number;
	id: number;
}

export type PrototypeMessage = ReadyMessage | EventMessage | ScoreMessage | StorageMessage | AiMessage;

// ---- Shell → Prototype ----

/** Handshake the shell sends once it has registered the prototype frame. */
export interface InitMessage extends Envelope {
	type: 'init';
	sessionId: string;
}

/** Reply to a StorageMessage (same id; value only for get). */
export interface StorageResultMessage extends Envelope {
	type: 'storage:result';
	id: number;
	value?: string | null;
}

/** Reply to an AiMessage (same id). `error` carries a machine-readable code (e.g.
 * "missing_user_key") the shell uses to decide whether to prompt for a saved key. */
export interface AiResultMessage extends Envelope {
	type: 'ai:result';
	id: number;
	text?: string;
	error?: { code: string; message: string };
}

export type ShellMessage = InitMessage | StorageResultMessage | AiResultMessage;

/** Narrow an unknown postMessage payload to a {@link PrototypeMessage}. */
export function isPrototypeMessage(data: unknown): data is PrototypeMessage {
	if (typeof data !== 'object' || data === null) return false;
	const m = data as Record<string, unknown>;
	if (m.source !== PROTOTIR_SOURCE || m.v !== PROTOTIR_PROTOCOL_VERSION) return false;
	return (
		m.type === 'ready' ||
		m.type === 'event' ||
		m.type === 'score' ||
		m.type === 'storage' ||
		m.type === 'ai'
	);
}

/** Narrow an unknown postMessage payload to a {@link ShellMessage}. */
export function isShellMessage(data: unknown): data is ShellMessage {
	if (typeof data !== 'object' || data === null) return false;
	const m = data as Record<string, unknown>;
	if (m.source !== PROTOTIR_SOURCE || m.v !== PROTOTIR_PROTOCOL_VERSION) return false;
	return m.type === 'init' || m.type === 'storage:result' || m.type === 'ai:result';
}
