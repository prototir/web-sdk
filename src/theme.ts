/**
 * Prototir's design tokens, bundled rather than fetched.
 *
 * Fetching a theme at runtime would fail exactly where we have least control: a native Unity or
 * Godot build running offline, and a sandboxed frame whose CSP deliberately has no network reach.
 * It would also let a shipped build re-style itself months later. Bundled values are immutable for
 * a given SDK version.
 *
 * The cost is drift, so `tools/check-theme.mjs` compares these against the webapp's stylesheet and
 * fails the build when they diverge. On Prototir the host can still refine them at runtime through
 * the `hello` reply, which costs no network because that channel already exists.
 */

export interface ReviewTheme {
	background: string;
	surface: string;
	surfaceRaised: string;
	ink: string;
	muted: string;
	line: string;
	lineStrong: string;
	accent: string;
	accentInk: string;
}

export const LIGHT_THEME: ReviewTheme = {
	background: '#f7f6f3',
	surface: '#efede8',
	surfaceRaised: '#ffffff',
	ink: '#050505',
	muted: '#3f3e3a',
	line: '#e2dfd8',
	lineStrong: '#8f8c84',
	accent: '#2563eb',
	accentInk: '#ffffff'
};

export const DARK_THEME: ReviewTheme = {
	background: '#18181b',
	surface: '#202024',
	surfaceRaised: '#27272c',
	ink: '#f5f4f1',
	muted: '#bbb9b3',
	line: '#36363c',
	lineStrong: '#6a6a73',
	accent: '#60a5fa',
	accentInk: '#18181b'
};

const VARIABLE_BY_KEY: Record<keyof ReviewTheme, string> = {
	background: '--ptr-background',
	surface: '--ptr-surface',
	surfaceRaised: '--ptr-surface-raised',
	ink: '--ptr-ink',
	muted: '--ptr-muted',
	line: '--ptr-line',
	lineStrong: '--ptr-line-strong',
	accent: '--ptr-accent',
	accentInk: '--ptr-accent-ink'
};

/** Only `#rgb`/`#rrggbb` is accepted: these values reach a stylesheet, so a host that sends
 * something else must not be able to inject declarations through them. */
const COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function sanitizeTheme(input: unknown): Partial<ReviewTheme> {
	const result: Partial<ReviewTheme> = {};
	if (!input || typeof input !== 'object') return result;
	for (const key of Object.keys(VARIABLE_BY_KEY) as (keyof ReviewTheme)[]) {
		const value = (input as Record<string, unknown>)[key];
		if (typeof value === 'string' && COLOR.test(value.trim())) result[key] = value.trim();
	}
	return result;
}

function declarations(theme: ReviewTheme): string {
	return (Object.keys(VARIABLE_BY_KEY) as (keyof ReviewTheme)[])
		.map((key) => `${VARIABLE_BY_KEY[key]}:${theme[key]}`)
		.join(';');
}

/**
 * Custom properties for the overlay's shadow root. `auto` follows the player's own preference,
 * which matters because the panel floats over someone else's game: a light card over a dark
 * scene reads as a foreign object rather than part of the experience.
 */
export function themeCss(mode: 'auto' | 'light' | 'dark', overrides: Partial<ReviewTheme> = {}): string {
	const light = { ...LIGHT_THEME, ...overrides };
	const dark = { ...DARK_THEME, ...overrides };
	if (mode === 'light') return `:host{${declarations(light)};color-scheme:light}`;
	if (mode === 'dark') return `:host{${declarations(dark)};color-scheme:dark}`;
	return (
		`:host{${declarations(light)};color-scheme:light dark}` +
		`@media (prefers-color-scheme:dark){:host{${declarations(dark)}}}`
	);
}
