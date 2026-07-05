// Input demo: one API for desktop AND mobile. Desktop gets WASD/arrows + Space;
// touch devices get a virtual joystick + an on-screen A button. Force the virtual
// UI with ?virtual=1 (handy for testing on a desktop browser).
import { createInput } from 'prefab-input';

const hud = document.getElementById('hud');
const force = new URLSearchParams(location.search).get('virtual') === '1';

const input = createInput({
	virtual: force ? true : 'auto',
	actions: [{ id: 'jump', key: 'Space', label: 'A' }]
});

let presses = 0;
input.onPress('jump', () => {
	presses += 1;
	Prototir.event('jump', { n: presses });
});

setInterval(() => {
	hud.textContent =
		`input-demo · mode ${input.virtual ? 'virtual (touch)' : 'keyboard'}\n` +
		`axes x ${input.axes.x.toFixed(2)} y ${input.axes.y.toFixed(2)}\n` +
		`jump held ${input.pressed('jump')} · presses ${presses}`;
}, 50);

Prototir.ready();
