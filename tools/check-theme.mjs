import { readFile } from 'node:fs/promises';

// Prototir's tokens are bundled into the SDK so the overlay renders offline and inside a frame
// with no network reach. The cost of bundling is drift, so they are compared against the webapp's
// stylesheet here: if the product's palette moves and the SDK's copy does not, this fails.
const STYLESHEET = new URL('../../prototir-webapp/src/routes/layout.css', import.meta.url);

// SDK token -> the webapp custom property it must equal, in each colour scheme.
const MAPPING = {
	background: '--background',
	surface: '--surface-1',
	surfaceRaised: '--surface-2',
	ink: '--text-1',
	muted: '--text-2',
	line: '--border-1',
	lineStrong: '--border-2',
	accent: '--accent'
};

let css;
try {
	css = await readFile(STYLESHEET, 'utf8');
} catch (error) {
	// A contributor without the webapp checked out cannot verify this, and should not be blocked.
	if (error.code === 'ENOENT') {
		console.log('Theme check skipped: prototir-webapp is not checked out alongside this repo.');
		process.exit(0);
	}
	throw error;
}

/** Each token is declared twice: the light block first, then the dark one. */
function declared(property) {
	// A character class rather than \s: this pattern is built in a template literal, where a
	// stray single backslash silently degrades into a literal letter and matches nothing.
	const pattern = new RegExp(property + ':[ \t]*(#[0-9a-fA-F]{3,8})', 'g');
	const found = [...css.matchAll(pattern)].map((match) => match[1].toLowerCase());
	return { light: found[0], dark: found[1] };
}

const { LIGHT_THEME, DARK_THEME } = await import('../dist/prototir.mjs');
const problems = [];
for (const [key, property] of Object.entries(MAPPING)) {
	const expected = declared(property);
	if (!expected.light || !expected.dark) {
		problems.push(`${property} is no longer declared twice in layout.css; update this mapping.`);
		continue;
	}
	if (LIGHT_THEME[key].toLowerCase() !== expected.light) {
		problems.push(
			`light ${key}: SDK has ${LIGHT_THEME[key]}, webapp ${property} is ${expected.light}`
		);
	}
	if (DARK_THEME[key].toLowerCase() !== expected.dark) {
		problems.push(`dark ${key}: SDK has ${DARK_THEME[key]}, webapp ${property} is ${expected.dark}`);
	}
}

if (problems.length) {
	console.error('SDK theme has drifted from Prototir:\n' + problems.map((p) => '  ' + p).join('\n'));
	process.exit(1);
}
console.log('SDK theme matches the webapp design tokens.');
