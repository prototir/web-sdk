// Physics demo: rapier3d (WASM, embedded in the compat build) + three, both
// platform-served via the import map. Cubes rain onto a floor; score = cubes landed.
import * as THREE from 'three';
import RAPIER from 'rapier3d';

const hud = document.getElementById('hud');

await RAPIER.init(); // instantiates the embedded WASM ('wasm-unsafe-eval' in the sandbox CSP)
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
world.createCollider(RAPIER.ColliderDesc.cuboid(6, 0.1, 6)); // static floor

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0a);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 4, 10);
camera.lookAt(0, 1, 0);
scene.add(new THREE.GridHelper(12, 12, 0x333333, 0x242424));

const geo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
const mat = new THREE.MeshBasicMaterial({ color: 0xededed, wireframe: true });
const cubes = [];

function spawnCube() {
	const body = world.createRigidBody(
		RAPIER.RigidBodyDesc.dynamic()
			.setTranslation((Math.random() - 0.5) * 6, 7, (Math.random() - 0.5) * 2)
			.setRotation({ x: Math.random(), y: Math.random(), z: Math.random(), w: 1 })
	);
	world.createCollider(RAPIER.ColliderDesc.cuboid(0.3, 0.3, 0.3).setRestitution(0.4), body);
	const mesh = new THREE.Mesh(geo, mat);
	scene.add(mesh);
	cubes.push({ body, mesh, scored: false });
}

let landed = 0;
const spawner = setInterval(() => {
	if (cubes.length < 40) spawnCube();
	else clearInterval(spawner);
}, 250);

renderer.setAnimationLoop(() => {
	world.step();
	for (const c of cubes) {
		const p = c.body.translation();
		const q = c.body.rotation();
		c.mesh.position.set(p.x, p.y, p.z);
		c.mesh.quaternion.set(q.x, q.y, q.z, q.w);
		if (!c.scored && p.y < 0.7 && c.body.linvel().y > -0.05) {
			c.scored = true;
			landed += 1;
			Prototir.event('cube_landed', { n: landed });
			Prototir.score(landed);
		}
	}
	hud.textContent = `physics-demo · rapier ${RAPIER.version()} · cubes ${cubes.length} · landed ${landed}`;
	renderer.render(scene, camera);
});

Prototir.ready();
