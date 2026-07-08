import { createHandControls } from 'prefab-hand-controls';

const hud = document.getElementById('hud');
const cursor = document.getElementById('cursor');

Prototir.ready();

let pinches = 0;

try {
	const hand = await createHandControls({
		onMove({ x, y }) {
			cursor.style.left = `${x * 100}%`;
			cursor.style.top = `${y * 100}%`;
			Prototir.event('hand_move');
		},
		onPinch({ down }) {
			cursor.classList.toggle('pinch', down);
			if (down) {
				pinches++;
				Prototir.event('pinch');
				Prototir.score(pinches * 10);
			}
		}
	});
	hud.textContent = 'hand-demo · tracking';
	window.__handDemoReady = hand; // E2E hook: presence = model+camera pipeline initialized
} catch (err) {
	hud.textContent = `hand-demo · ${err.message}`;
	window.__handDemoError = String(err.message);
}
