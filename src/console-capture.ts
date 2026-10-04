/**
 * Records the build's console output from the moment the SDK loads, so the error a tester saw
 * before opening the Console panel is already there (§16.7).
 *
 * Built to cost as little as possible while nothing is looking at it: each call stores one short
 * string in a fixed ring of {@link CAPACITY} entries. Values are formatted on capture with a cheap,
 * bounded formatter (never `JSON.stringify` of an arbitrary object), so a game logging every frame
 * pays a few microseconds and the buffer never keeps the game's objects alive.
 */

export type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';
export interface ConsoleEntry { time: number; level: ConsoleLevel; text: string }

export const CAPACITY = 300;
const MAX_ARGUMENT = 300;
const MAX_ENTRY = 2000;

const ring: (ConsoleEntry | undefined)[] = new Array(CAPACITY);
let next = 0;
let count = 0;
let installed = false;
let paused = false;
const listeners = new Set<() => void>();
const originals: Partial<Record<ConsoleLevel, (...args: unknown[]) => void>> = {};

function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

/** A short, bounded description of any value: primitives as they are, everything else in a line. */
export function describe(value: unknown): string {
  switch (typeof value) {
    case 'string': return clip(value, MAX_ARGUMENT);
    case 'number': case 'boolean': case 'bigint': case 'undefined': return String(value);
    case 'symbol': return value.toString();
    case 'function': return `ƒ ${value.name || 'anonymous'}()`;
  }
  if (value === null) return 'null';
  if (value instanceof Error) {
    const stack = (value.stack ?? '').split('\n').slice(1, 6).map(line => line.trim()).join('\n  ');
    return clip(`${value.name}: ${value.message}${stack ? '\n  ' + stack : ''}`, MAX_ENTRY);
  }
  if (Array.isArray(value)) return `Array(${value.length})`;
  try {
    // A shallow look at a plain object: its first few keys with primitive values. Bounded work
    // whatever the object's size, and no reference is kept.
    const keys = Object.keys(value as object).slice(0, 6);
    const parts = keys.map(key => {
      const field = (value as Record<string, unknown>)[key];
      const shown = field === null || typeof field !== 'object' && typeof field !== 'function'
        ? describe(field).slice(0, 40)
        : Array.isArray(field) ? `Array(${field.length})` : '{…}';
      return `${key}: ${shown}`;
    });
    const name = (value as object).constructor?.name;
    return clip(`${name && name !== 'Object' ? name + ' ' : ''}{${parts.join(', ')}${Object.keys(value as object).length > keys.length ? ', …' : ''}}`, MAX_ARGUMENT);
  } catch { return '[object]'; }
}

function push(level: ConsoleLevel, text: string) {
  if (paused) return;
  ring[next] = { time: Date.now(), level, text: clip(text, MAX_ENTRY) };
  next = (next + 1) % CAPACITY;
  count = Math.min(count + 1, CAPACITY);
  for (const listener of listeners) listener();
}

/** Starts recording. Safe to call more than once. */
export function installConsoleCapture() {
  if (installed || typeof console === 'undefined') return;
  installed = true;
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const original = console[level];
    if (typeof original !== 'function') continue;
    originals[level] = original;
    console[level] = function (this: Console, ...args: unknown[]) {
      try { push(level, args.map(describe).join(' ')); } catch { /* Never break the game's logging. */ }
      return original.apply(this, args);
    };
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('error', event => {
      push('error', event.error ? describe(event.error) : `${event.message} (${event.filename}:${event.lineno})`);
    });
    window.addEventListener('unhandledrejection', event => {
      push('error', 'Unhandled promise rejection: ' + describe(event.reason));
    });
  }
}

/** Stops recording and restores the console (a build that turned the Console tool off). */
export function uninstallConsoleCapture() {
  if (!installed) return;
  for (const [level, original] of Object.entries(originals)) (console as unknown as Record<string, unknown>)[level] = original;
  installed = false;
  paused = true;
}

/** The recorded entries, oldest first. */
export function consoleEntries(): ConsoleEntry[] {
  const entries: ConsoleEntry[] = [];
  for (let i = 0; i < count; i++) {
    const entry = ring[(next - count + i + CAPACITY) % CAPACITY];
    if (entry) entries.push(entry);
  }
  return entries;
}

export function clearConsole() {
  ring.fill(undefined); next = 0; count = 0;
  for (const listener of listeners) listener();
}

/** The log as plain text, one line per entry: the form Copy and comments use. */
export function consoleText(entries = consoleEntries()): string {
  return entries.map(entry => {
    const time = new Date(entry.time).toISOString().slice(11, 23);
    return `${time} [${entry.level}] ${entry.text}`;
  }).join('\n');
}

/** Called after each new entry while someone is watching (the Console panel). */
export function onConsoleEntry(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
