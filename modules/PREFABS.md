# Prototir Prefabs — reference

Prefabs are Prototir-built, MIT-licensed scaffolds served like any other module and
declared in `prototir.json`:

```json
{ "modules": ["three@0.170.0", "rapier3d@0.14.0", "prefab-thirdperson-rig@0.1.0"] }
```

**Status:** `available` = servable today · `planned` = catalogued, not yet built.
The machine-readable source of truth is `modules.json` (`status` field).

## The prefab convention (all prefabs follow it)

1. **A factory, not a framework.** Each prefab exports one `create…()` function taking a
   single **options object**. Every option has a sensible default — `create…()` with no
   arguments gives you something that runs.
2. **Customize via options, extend via the handle.** The factory returns a **handle**
   exposing the prefab's internals (`scene`, `world`, `body`, `canvas`, …) plus
   `destroy()`. Nothing is hidden: if an option doesn't exist for what you want, reach
   into the handle.
3. **Bring-your-own-content hooks.** Anything visual/behavioural that a creator will
   obviously want to replace (the avatar, the shader, the detector) is an option that
   accepts *your object or a factory function* — the default is only a placeholder.
4. **Assets come from your bundle.** The sandbox CSP allows same-origin fetches, so
   loaders (GLTF, textures, `.onnx` models) can read files you ship inside your own
   bundle with relative URLs.

---

## `prefab-thirdperson-rig@0.1.0` — available

Batteries-included third-person controller: rapier capsule physics, follow camera,
WASD/arrows + Shift sprint + Space jump, and a default **procedural puppet** (wireframe
figure built from primitives — zero assets).

Requires: `three@0.170.0`, `rapier3d@0.14.0`.

```js
import { createThirdPersonRig } from 'prefab-thirdperson-rig';
const rig = await createThirdPersonRig();   // playable immediately
rig.scene.add(myLevel);                     // build your world around it
```

| Option | Default | What it does |
| --- | --- | --- |
| `avatar` | default puppet | `THREE.Object3D`, or `(THREE) => Object3D`. **This is how you swap the puppet for your own model.** |
| `speed` / `sprint` | `5` / `8` | m/s walk / with Shift |
| `turnRate` | `2.6` | rad/s for A/D |
| `jumpVelocity` | `6` | m/s upward on Space (grounded only) |
| `camera` | `{distance: 5, height: 2.4, lag: 0.08}` | follow-cam framing |
| `ground` | `true` | 40×40 floor collider + grid; `false` to bring your own |
| `world` | created | pass an existing `RAPIER.World` to share physics |
| `input` | built-in keyboard | pass a **`prefab-input` handle** and the same rig runs on mobile (joystick → turn/move, `jump`/`sprint` actions) |
| `mount` | `document.body` | where the canvas goes |
| `onUpdate` | — | `(dt, rig)` every frame after physics — your game loop |

**Handle:** `{ THREE, RAPIER, renderer, scene, camera, world, body, avatar, position, grounded, yaw, destroy() }`.

### Recipe: use your own character model (GLTF)

Ship the model inside your bundle and load it yourself — the import map makes three's
addons work with bare specifiers, and the CSP allows the same-origin fetch:

```js
import { GLTFLoader } from '/modules/three@0.170.0/examples/jsm/loaders/GLTFLoader.js';
import { createThirdPersonRig } from 'prefab-thirdperson-rig';

const gltf = await new GLTFLoader().loadAsync('assets/hero.glb'); // from YOUR bundle
gltf.scene.scale.setScalar(0.9);
const rig = await createThirdPersonRig({ avatar: gltf.scene });
```

The rig moves/rotates whatever object you give it (feet at local y≈0, facing −Z).
Animation mixers are yours to drive from `onUpdate` (a built-in walk/idle animation
hook is planned for 0.2).

---

## `prefab-input@0.2.0` — available

**One input API for desktop AND mobile.** Desktop: keyboard drives axes and actions.
Touch devices (auto-detected via coarse pointer, or forced): a **fully customizable
virtual overlay** — any number of buttons, joysticks and d-pads, each with its own
position, size and shape. Press semantics (press / release / short press / long press)
behave identically for keyboard keys and on-screen controls. Your code reads the same
things either way — this is how a prototype honestly declares `"devices": "both"`.

```js
import { createInput } from 'prefab-input';
const input = createInput({ actions: [{ id: 'jump', key: 'Space', label: 'A' }] });
// per frame:
input.axes            // axis('move') — { x: -1..1, y: -1..1 }  (y = forward)
input.axis('look')    // any extra stick / d-pad by id
input.pressed('jump') // held?
input.onPress('jump', () => …) // edge-triggered; also onRelease / onShortPress / onLongPress
```

| Option | Default | What it does |
| --- | --- | --- |
| `actions` | `[]` | `[{ id, key, label?, position?, size?, shape?, longPressMs? }]` — keyboard key on desktop, button on touch |
| `virtual` | `'auto'` | `'auto'` = coarse-pointer devices; `true`/`false` to force |
| `joystick` | `true` | primary `'move'` stick: `true` / `false` / `{ position?, size?, keys? }`; WASD+arrows on desktop |
| `joysticks` | `[]` | extra sticks: `[{ id, position?, size?, keys?: {up,down,left,right} }]` — read via `axis(id)`; `keys` gives desktop parity (codes or arrays of codes) |
| `dpad` | `false` | digital 4-way instead of (or besides) a stick: `true` / `{ id?: 'move', position?, size? }` — writes −1/0/1 to `axis(id)`; pair with `joystick: false` |
| `joystickSize` | `120` | default stick size in px |
| `longPressMs` | `450` | default long-press threshold; override per action |
| `mount` | `document.body` | where the touch overlay goes |

Per-control customization:

- **`position`** — CSS offsets in px or strings, e.g. `{ right: 120, bottom: 40 }` or
  `{ left: '4vw', top: '50%' }`. Buttons without one auto-stack bottom-right; the move
  stick defaults bottom-left.
- **`size`** — px (buttons default 72, sticks 120, d-pad 156). **`shape`** (buttons) —
  `'round'` (default) or `'square'`.
- **Press semantics** — `onPress` fires on touch/key down, `onRelease` on up.
  `onLongPress` fires *at* the threshold while still held (`longPressMs`, per-action
  override); `onShortPress` fires on release only if the threshold wasn't reached.
  Identical for keyboard and touch — tap-vs-hold mechanics work everywhere.
- **Multi-touch** — every stick captures its own pointer, so two thumbs can drive
  `move` and `look` simultaneously while buttons still fire.

**Handle:** `{ axes, axis(id), virtual, pressed(id), onPress/onRelease/onShortPress/onLongPress(id, cb) → off(), destroy() }`.
The touch UI carries `data-prototir-input="overlay|joystick|dpad"`,
`data-stick="{id}"`, `data-action="{id}"` and `data-dir` hooks — restyle it from your
own CSS if you want. The 0.1 API is a strict subset — existing prototypes keep working
(and `prefab-input@0.1.0` stays served regardless; module versions are immutable).

A two-stick layout with tap-vs-hold combat in one call:

```js
const input = createInput({
	joystick: { position: { left: 24, bottom: 24 }, size: 140 },                 // move
	joysticks: [{ id: 'look', position: { right: 24, bottom: 150 }, size: 110,
	              keys: { up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL' } }],
	actions: [
		{ id: 'jump',   key: 'Space', label: 'A' },
		{ id: 'attack', key: 'KeyF', label: '⚔', position: { right: 120, bottom: 40 },
		  size: 64, shape: 'square', longPressMs: 600 }                          // tap = light, hold = heavy
	]
});
input.onShortPress('attack', lightAttack);
input.onLongPress('attack', heavyAttack);
```

Pairs with the rig for a phone-ready character in two lines:

```js
const input = createInput({ actions: [{ id: 'jump', key: 'Space', label: 'A' }, { id: 'sprint', key: 'ShiftLeft', label: '▶▶' }] });
const rig = await createThirdPersonRig({ input });
```

### Device targeting (`prototir.json`)

Declare what a prototype is designed for; the platform surfaces it (chip on the watch
page + a non-blocking "designed for …" note when the player's device doesn't match):

```json
{ "devices": "desktop" }   // "desktop" | "mobile" | "both" (default)
```

Use `prefab-input` and you can usually just leave it at `both`.

---

## `prefab-shader-canvas@0.1.0` — available

Full-screen fragment-shader boilerplate: WebGL setup, resize handling, RAF loop, and the
uniforms `u_time`, `u_resolution`, `u_mouse` (+ varying `v_uv`).

```js
import { createShaderCanvas } from 'prefab-shader-canvas';
const sc = createShaderCanvas({ fragment: myGlsl });   // your shader IS the option
```

| Option | Default | What it does |
| --- | --- | --- |
| `fragment` | demo gradient | your GLSL fragment shader (the whole point) |
| `canvas` | created full-screen | render into your own `<canvas>` instead |
| `onFrame` | — | `(t)` per frame — drive game logic / SDK events |

**Handle:** `{ canvas, destroy() }`.

---

## `prefab-webcam-cv@0.1.0` — available

Webcam → inference loop: getUserMedia, `<video>`, a stream-sized overlay canvas, and a
busy-guarded `onFrame` so inference never queues behind itself. **Model-agnostic** — you
bring the runner (onnxruntime-web session, tfjs model, or plain canvas effects).

Requires `"permissions": ["camera"]` in `prototir.json` (the shell asks the player for
consent first).

```js
import { createWebcamCV, drawDetections } from 'prefab-webcam-cv';
const cam = await createWebcamCV({
	async onFrame({ video, ctx }) {
		const boxes = await runMyDetector(video);  // e.g. an ort.InferenceSession you own
		drawDetections(ctx, boxes);
	}
});
```

| Option | Default | What it does |
| --- | --- | --- |
| `onFrame` | — | `({video, canvas, ctx, t})` — run your model, draw the overlay |
| `video` | `{facingMode:'user', 960×540 ideal}` | getUserMedia video constraints |
| `mount` | `document.body` | where the video+overlay go |

**Handle:** `{ video, canvas, ctx, stream, destroy() }`.
Helper: `drawDetections(ctx, [{x,y,w,h,label?,score?}], {color?})` — labeled boxes in the
Prototir style. Ship a small `.onnx` in your bundle and point onnxruntime-web at it with
a relative URL; heavier curated weights (RF-DETR-nano etc.) arrive as model packs with
the real CDN (P2).

---

## Planned prefabs (API sketches — subject to change)

| Prefab | Requires | Sketch |
| --- | --- | --- |
| `prefab-fps-rig` | three, rapier3d | `createFpsRig({ speed, jumpVelocity, pointerLock: true })` → pointer-lock WASD; same handle shape as thirdperson |
| `prefab-platformer-2d` | phaser | `createPlatformer({ tilemap, player: {sprite?, coyoteMs} })` — sprite swap is the avatar-equivalent |
| `prefab-topdown-2d` | phaser | `createTopdown({ player, speed })` — 8-way movement + interaction zones |
| `prefab-vehicle-rig` | three, rapier3d | `createVehicle({ chassis?, tuning: {grip, accel} })` — chassis mesh swappable like `avatar` |
| `prefab-hand-controls` | mediapipe-vision | `createHandControls({ onPinch, onMove })` → pointer-like events from hand landmarks |
| `prefab-voice-input` | model-whisper-tiny | `createVoiceInput({ onTranscript, pushToTalk: 'Space' })` |
| `prefab-ai-npc` | capability-ai | `createNpc({ persona, memory: 8 })` → `npc.say(text): Promise<reply>` (P3, needs the AI broker) |
| `prefab-audio-reactive` | meyda | `createAudioReactive({ features: ['rms','centroid'], onFeatures })` |

Templates (forkable starter prototypes) get published as official open-source prototypes
once the API can seed them; the `examples/` here (modules-demo, physics-demo,
thirdperson-demo) are their local stand-ins.
