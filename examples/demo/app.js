// External script (sandbox CSP forbids inline scripts — script-src 'self').
// Show which prototype this is (from the /{slug}/ path).
const slug = decodeURIComponent(location.pathname.split('/').filter(Boolean)[0] || 'demo');
document.getElementById('slug').textContent = slug;

let score = 0;
const scoreEl = document.getElementById('score');

// Announce we're ready — starts the real session in the shell.
Prototir.ready();

document.getElementById('tap').addEventListener('click', () => {
	score += 10;
	scoreEl.textContent = String(score);
	Prototir.event('tap', { score });
	Prototir.score(score);
});

document.getElementById('level').addEventListener('click', () => {
	Prototir.event('level_complete', { level: 2 });
});
