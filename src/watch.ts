/**
 * Watched values (§16.7): a prototype names a few pieces of its own state, such as the player's
 * health or the current level, and Prototir shows them live in the Watch panel and attaches them
 * to every feedback report, so a bug arrives with the state it happened in.
 *
 * Values are read only when shown or reported, never on a timer of their own, so a watch costs
 * nothing while nobody is looking.
 */

export const MAX_WATCHES = 20;
export const MAX_VALUE_LENGTH = 200;
const NAME = /^[A-Za-z0-9_.:-]{1,40}$/;

const watches = new Map<string, { read: () => unknown }>();
const listeners = new Set<() => void>();

/** Starts watching `read()` under `name`, replacing an earlier watch of the same name. Returns a
 *  function that stops it. Invalid names, or a 21st watch, are ignored with a console warning. */
export function watch(name: string, read: () => unknown): () => void {
	if (typeof name !== 'string' || !NAME.test(name) || typeof read !== 'function') {
		console.warn('Prototir.debug.watch: use a name of 1-40 letters, digits, _ . : or -, and a function.');
		return () => {};
	}
	if (!watches.has(name) && watches.size >= MAX_WATCHES) {
		console.warn(`Prototir.debug.watch: at most ${MAX_WATCHES} values can be watched.`);
		return () => {};
	}
	const registration = { read };
	watches.set(name, registration);
	changed();
	return () => {
		if (watches.get(name) === registration) unwatch(name);
	};
}

export function unwatch(name: string): void {
	if (watches.delete(name)) changed();
}

export function hasWatches(): boolean {
	return watches.size > 0;
}

/** Called when a watch is added or removed (not when a value changes). */
export function onWatchesChanged(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** Every watched value now, as short text. A reader that throws shows its error instead. */
export function watchedValues(): Record<string, string> {
	const values: Record<string, string> = Object.create(null);
	for (const [name, { read }] of watches) {
		let text: string;
		try {
			text = format(read());
		} catch (error) {
			try { text = `error: ${error instanceof Error ? error.message : String(error)}`; }
			catch { text = 'error: unreadable value'; }
		}
		values[name] = text.length > MAX_VALUE_LENGTH ? text.slice(0, MAX_VALUE_LENGTH - 1) + '…' : text;
	}
	return values;
}

function format(value: unknown): string {
	if (value === undefined) return 'undefined';
	if (typeof value === 'string') return value;
	if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Math.round(value * 1e4) / 1e4);
	if (typeof value === 'bigint' || typeof value === 'boolean' || value === null) return String(value);
	if (typeof value === 'function') return '[function]';
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
}

function changed() {
	for (const listener of listeners) {
		try {
			listener();
		} catch {
			// A listener must never break the prototype that registered a watch.
		}
	}
}
