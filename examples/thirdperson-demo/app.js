// Third-person rig demo: default puppet, a few obstacles, coin pickups wired to the SDK.
// Swap the puppet: createThirdPersonRig({ avatar: yourObject3D }) — see PREFABS.md.
import { createThirdPersonRig } from 'prefab-thirdperson-rig';

const hud = document.getElementById('hud');
let coins = null;
let collected = 0;

const rig = await createThirdPersonRig({
	speed: 5,
	camera: { distance: 6, height: 2.6 },
	onUpdate(dt, r) {
		if (!coins) return; // level still building
		const p = r.position;
		for (const c of coins) {
			if (c.visible && Math.hypot(c.position.x - p.x, c.position.z - p.z) < 0.9) {
				c.visible = false;
				collected += 1;
				Prototir.event('coin', { n: collected });
				Prototir.score(collected * 10);
			}
			c.rotation.y += dt * 2;
		}
		hud.textContent =
			`thirdperson-demo · pos ${p.x.toFixed(1)},${p.z.toFixed(1)} · ` +
			`${r.grounded ? 'grounded' : 'airborne'} · coins ${collected}/5 · WASD + Space`;
	}
});
const { THREE, RAPIER, scene, world } = rig;

// Level: a few wireframe blocks with matching colliders.
const blockMat = new THREE.MeshBasicMaterial({ color: 0x8a8a8a, wireframe: true });
for (const [x, z] of [[4, -3], [-5, 2], [2, 6], [-3, -6]]) {
	const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), blockMat);
	mesh.position.set(x, 0.8, z);
	scene.add(mesh);
	world.createCollider(RAPIER.ColliderDesc.cuboid(0.8, 0.8, 0.8).setTranslation(x, 0.8, z));
}

// Coins: collect by proximity → SDK events + score.
const coinMat = new THREE.MeshBasicMaterial({ color: 0xededed, wireframe: true });
coins = [[6, 0], [-6, -3], [0, -7], [5, 5], [-2, 7]].map(([x, z]) => {
	const m = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.12, 6, 12), coinMat);
	m.position.set(x, 0.8, z);
	scene.add(m);
	return m;
});

Prototir.ready();
