// Modules demo: bare-specifier imports resolved by the injected import map (D22).
// Proves platform-served modules + prefab + SDK all work under the sandbox CSP.
import * as THREE from 'three';
import { createShaderCanvas } from 'prefab-shader-canvas';

const hud = document.getElementById('hud');

// Layer 1: animated shader background (prefab).
createShaderCanvas({
	fragment: `
precision mediump float;
varying vec2 v_uv;
uniform float u_time;
void main() {
	float wave = sin(v_uv.x * 8.0 + u_time) * sin(v_uv.y * 8.0 - u_time * 0.7);
	float ink = smoothstep(0.85, 0.95, wave);
	gl_FragColor = vec4(vec3(0.04) + ink * vec3(0.55), 1.0);
}`
});

// Layer 2: three.js wireframe on a transparent canvas above the shader.
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
Object.assign(renderer.domElement.style, { position: 'fixed', inset: '0' });
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 3;
const mesh = new THREE.Mesh(
	new THREE.IcosahedronGeometry(1.1, 1),
	new THREE.MeshBasicMaterial({ color: 0xededed, wireframe: true })
);
scene.add(mesh);

addEventListener('resize', () => {
	camera.aspect = innerWidth / innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(innerWidth, innerHeight);
});

let spins = 0;
renderer.setAnimationLoop((t) => {
	mesh.rotation.set(t / 2400, t / 1700, 0);
	const s = Math.floor(t / 3000);
	if (s > spins) {
		spins = s;
		Prototir.event('spin', { n: spins });
		Prototir.score(spins * 10);
	}
	renderer.render(scene, camera);
});

// SDK: real session + storage roundtrip (per-prototype persistence via the shell).
Prototir.ready();
const visits = Number((await Prototir.storage.get('visits')) ?? 0) + 1;
await Prototir.storage.set('visits', String(visits));
hud.textContent = `modules-demo · three r${THREE.REVISION} · visit ${visits}`;
