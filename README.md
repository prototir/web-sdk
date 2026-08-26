# Prototir Web SDK

The official browser SDK for prototypes hosted on [Prototir](https://prototir.com). It provides a
small, typed API for lifecycle signals, analytics events, scores, persistent storage, managed text
generation, and deterministic random numbers.

Prototypes run in a sandboxed iframe. The SDK communicates only with the parent Prototir player by
using a versioned `postMessage` protocol; it does not contain credentials or contact external APIs.

## Add the SDK

For a plain HTML bundle, include the immutable CDN build before your application script:

```html
<script src="https://cdn.prototir.com/sdk/v0.1.0/prototir.js"></script>
<script src="app.js"></script>
```

For a TypeScript or bundled project, install the package after it is published to npm:

```bash
npm install @prototir/web-sdk
```

```ts
import { Prototir } from '@prototir/web-sdk';
```

Until the npm release is available, use the CDN build or install a tagged GitHub release.

## Basic use

```js
Prototir.ready();
Prototir.event('level_complete', { level: 2 });
Prototir.score(1200);

await Prototir.storage.set('difficulty', 'hard');
const difficulty = await Prototir.storage.get('difficulty');

const quest = await Prototir.ai.generate({
  prompt: 'Give the player a short quest hook.',
  maxTokens: 80
});
```

Call `ready()` when the prototype is genuinely interactive, not while it is still displaying a
loader. Event names are normalized to lowercase and must contain 1-64 letters, numbers, `_`, `.`,
`:`, or `-`. Keep event payloads small and free of personal data.

## API

| Member | Description |
| --- | --- |
| `ready()` | Starts the measured play session when the prototype becomes interactive. |
| `event(name, data?)` | Records a stable analytics event with an optional JSON-compatible object. |
| `score(value)` | Reports a finite numeric score. |
| `storage.get(key)` | Reads a stored string or returns `null`. |
| `storage.set(key, value)` | Stores a string scoped to the prototype and signed-in player. |
| `storage.remove(key)` | Removes a stored value. |
| `ai.generate(options)` | Requests provider-neutral managed text generation. |
| `rng(seed?)` | Creates a deterministic local random-number function. |

Storage keys may contain up to 128 characters. Each value is limited to 64 KiB of UTF-8 data. A
prototype does not need—and should never contain—service credentials. Managed AI routing,
moderation, and allowance enforcement are handled by Prototir. Enable AI in `prototir.json` with
`"ai": { "mode": "managed" }` and handle rejected requests by their `{ code, message }` value.

## Pointer lock and Escape

Pointer lock is a browser API and does not require an SDK method. Request it from a player action,
read mouse deltas only while the canvas is locked, and pause or show a resume action when Escape
releases the lock:

```js
const canvas = document.querySelector('canvas');

canvas.addEventListener('click', () => canvas.requestPointerLock());
document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== canvas) return;
  rotateCamera(event.movementX, event.movementY);
});
document.addEventListener('pointerlockchange', () => {
  setPaused(document.pointerLockElement !== canvas);
});
```

Do not imitate pointer lock with `cursor: none`; that only hides the cursor. Games may disable text
selection in their own CSS with `user-select: none`, but the platform leaves selection enabled so
non-game prototypes remain accessible.

## Protocol and security model

`src/protocol.ts` defines protocol version 1. Because the iframe intentionally has an opaque
origin, the player validates messages by frame identity. The player supplies its origin through the
`prototir_origin` URL parameter so replies can use a specific target origin. The SDK accepts host
messages only from `window.parent` and only when their source and protocol version match.

## Develop

Requires Node.js 20 or newer.

```bash
npm ci
npm run check
npm run build:cdn
```

`npm run build` produces an IIFE build, an ES module, declarations, and source maps in `dist`.
`npm run build:cdn` creates a versioned CDN directory and SHA-384 integrity manifest in `.cdn-dist`.
Runnable starter projects live in the
[web-examples repository](https://github.com/prototir/web-examples).

See the [creator documentation](https://prototir.com/docs/creators?runtime=web#setup) for bundle and
publishing requirements.

## License

[MIT](LICENSE.md)
