// Input demo: one API for desktop AND mobile, now fully customizable (0.2).
// Desktop: WASD/arrows move, IJKL look, Space jump, F attack (tap vs ≥600ms hold).
// Touch: move stick bottom-left, look stick bottom-right, custom-positioned
// square attack button, round A jump button. Force the virtual UI with
// ?virtual=1 (handy for testing on a desktop browser).
import { createInput } from 'prefab-input';

const hud = document.getElementById('hud');
const force = new URLSearchParams(location.search).get('virtual') === '1';

const input = createInput({
	virtual: force ? true : 'auto',
	joystick: { position: { left: 24, bottom: 24 }, size: 130 },
	joysticks: [
		{
			id: 'look',
			position: { right: 24, bottom: 150 },
			size: 110,
			keys: { up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL' }
		}
	],
	actions: [
		{ id: 'jump', key: 'Space', label: 'A' },
		{
			id: 'attack',
			key: 'KeyF',
			label: '⚔',
			position: { right: 120, bottom: 40 },
			size: 64,
			shape: 'square',
			longPressMs: 600
		}
	]
});

let presses = 0, shorts = 0, longs = 0, releases = 0;
input.onPress('jump', () => {
	presses += 1;
	Prototir.event('jump', { n: presses });
});
input.onShortPress('attack', () => { shorts += 1; });
input.onLongPress('attack', () => { longs += 1; });
input.onRelease('attack', () => { releases += 1; });

setInterval(() => {
	const look = input.axis('look');
	hud.textContent =
		`input-demo · mode ${input.virtual ? 'virtual (touch)' : 'keyboard'}\n` +
		`move x ${input.axes.x.toFixed(2)} y ${input.axes.y.toFixed(2)}\n` +
		`look x ${look.x.toFixed(2)} y ${look.y.toFixed(2)}\n` +
		`jump held ${input.pressed('jump')} · presses ${presses}\n` +
		`attack (hold ≥600ms for heavy) short ${shorts} · long ${longs} · releases ${releases}`;
}, 50);

Prototir.ready();
