// Sketch demo: the byte-light art stack. prefab-sketch drives a deterministic
// orbit field (seeded by Prototir.rng — same day, same field for everyone),
// prefab-audio beeps on click/tap (zero assets), and with ?mic=1 the orbits
// pulse to your microphone via prefab-audio-features (requires mic permission).
import { createSketch } from 'prefab-sketch';
import { createAudio } from 'prefab-audio';
import { createAudioFeatures } from 'prefab-audio-features';

const hud = document.getElementById('hud');
const wantMic = new URLSearchParams(location.search).get('mic') === '1';

const seed = 'orbit-' + new Date().toISOString().slice(0, 10);
const rand = Prototir.rng(seed);
const orbits = Array.from({ length: 24 }, () => ({
	r: 40 + rand() * 260,
	speed: 0.2 + rand() * 0.8,
	phase: rand() * Math.PI * 2,
	size: 2 + rand() * 6
}));

const audio = createAudio();
let mic = null;
let micError = '';
if (wantMic) {
	try {
		mic = await createAudioFeatures({});
	} catch (e) {
		micError = String(e?.name ?? e);
	}
}

let clicks = 0;
const sketch = createSketch({
	draw(ctx, { t, width, height, mouse }) {
		ctx.fillStyle = 'rgba(10,10,10,0.25)';
		ctx.fillRect(0, 0, width, height);
		const cx = width / 2, cy = height / 2;
		const pulse = mic ? 1 + mic.features.rms * 8 : 1;
		ctx.strokeStyle = '#333';
		ctx.strokeRect(cx - 4, cy - 4, 8, 8);
		ctx.fillStyle = '#ededed';
		for (const o of orbits) {
			const a = o.phase + t * o.speed;
			const x = cx + Math.cos(a) * o.r * pulse;
			const y = cy + Math.sin(a) * o.r * 0.6 * pulse;
			ctx.beginPath();
			ctx.arc(x, y, o.size, 0, Math.PI * 2);
			ctx.fill();
		}
		if (mouse.down) {
			ctx.strokeStyle = '#7dd3a0';
			ctx.strokeRect(mouse.x - 12, mouse.y - 12, 24, 24);
		}
	}
});

sketch.canvas.addEventListener('pointerdown', () => {
	clicks += 1;
	audio.beep(660 + clicks * 60, 0.07);
	Prototir.event('pulse', { n: clicks });
});

setInterval(() => {
	hud.textContent =
		`sketch-demo · seed ${seed}\n` +
		`frame ${sketch.state.frame} · t ${sketch.state.t.toFixed(1)}s · clicks ${clicks}\n` +
		(wantMic
			? mic
				? `mic rms ${mic.features.rms.toFixed(3)} · energy ${mic.features.energy.toFixed(3)} · centroid ${mic.features.centroid.toFixed(3)}`
				: `mic unavailable (${micError})`
			: 'tap to beep · ?mic=1 for audio-reactive mode');
}, 50);

Prototir.ready();
