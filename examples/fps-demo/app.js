// FPS demo: pointer-lock first person on desktop (click to lock, WASD + mouse),
// two-stick touch controls on phones via prefab-input (move + look sticks, A = jump).
// Walk into a pillar's beacon to score. Force touch UI with ?virtual=1.
import { createInput } from 'prefab-input';
import { createFpsRig } from 'prefab-fps-rig';

const hud = document.getElementById('hud');
const force = new URLSearchParams(location.search).get('virtual') === '1';
const coarse = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const touch = force || coarse;

const input = touch
	? createInput({
			virtual: true,
			joystick: { position: { left: 24, bottom: 24 }, size: 130 },
			joysticks: [{ id: 'look', position: { right: 24, bottom: 130 }, size: 110 }],
			actions: [
				{ id: 'jump', key: 'Space', label: 'A' },
				{ id: 'sprint', key: 'ShiftLeft', label: '▶▶', position: { right: 24, bottom: 260 }, size: 56 }
			]
		})
	: null;

const rig = await createFpsRig({ input });
const { THREE, RAPIER, scene, world } = rig;

// A small arena: pillars to weave through, one glowing beacon to find.
const mat = new THREE.MeshBasicMaterial({ color: 0xededed, wireframe: true });
for (let i = 0; i < 10; i++) {
	const a = (i / 10) * Math.PI * 2;
	const x = Math.sin(a) * 8, z = Math.cos(a) * 8;
	const pillar = new THREE.Mesh(new THREE.BoxGeometry(1, 3, 1), mat);
	pillar.position.set(x, 1.5, z);
	scene.add(pillar);
	world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 1.5, 0.5).setTranslation(x, 1.5, z));
}
const beacon = new THREE.Mesh(
	new THREE.OctahedronGeometry(0.5),
	new THREE.MeshBasicMaterial({ color: 0x7dd3a0, wireframe: true })
);
let score = 0;
const placeBeacon = () => {
	const a = Math.random() * Math.PI * 2;
	beacon.position.set(Math.sin(a) * 6, 1, Math.cos(a) * 6);
};
placeBeacon();
scene.add(beacon);

setInterval(() => {
	const p = rig.position;
	const d = Math.hypot(beacon.position.x - p.x, beacon.position.z - p.z);
	if (d < 1) {
		score += 1;
		Prototir.score(score);
		placeBeacon();
	}
	beacon.rotation.y += 0.1;
	hud.textContent =
		`fps-demo · ${touch ? 'touch (two sticks)' : rig.locked ? 'pointer locked' : 'click to lock pointer'}\n` +
		`pos ${p.x.toFixed(1)}, ${p.z.toFixed(1)} · yaw ${rig.yaw.toFixed(2)} · pitch ${rig.pitch.toFixed(2)}\n` +
		`grounded ${rig.grounded} · beacons ${score}`;
}, 50);

Prototir.ready();
