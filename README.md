# Prototir Web SDK

The official browser SDK for [Prototir](https://prototir.com), where creators publish playable
prototypes and testers play them and leave feedback. A small, typed API for lifecycle signals,
analytics events, scores, persistent storage, managed text generation and deterministic random
numbers, plus **Feedback & tools**: Screenshot, Comment, Console and Performance for your testers,
with nothing for you to write.

Prototypes run in a sandboxed iframe. The SDK talks only to the Prototir player, over a versioned
`postMessage` protocol; it holds no credentials and calls no external service of its own.

## Add the SDK

On Prototir, load it from the player's own path, before your application script:

```html
<script src="/prototir.js"></script>
<script src="app.js"></script>
```

Prototir serves the current SDK from `/prototir.js`, so a published prototype gets new versions,
including new testing tools, without being uploaded again.

Hosting the build yourself? Use the CDN:

| Address | Behaviour |
| --- | --- |
| `https://cdn.prototir.com/sdk/v0/prototir.js` | Follows the newest 0.x release within minutes. |
| `https://cdn.prototir.com/sdk/v0.3.0/prototir.js` | Pinned and immutable; never changes. |

Each pinned release also has a `manifest.json` with SHA-384 digests for Subresource Integrity.

### With a bundler (npm)

```bash
npm install @prototir/web-sdk
```

```ts
import { Prototir } from '@prototir/web-sdk';
```

Keep `<script src="/prototir.js"></script>` in your `index.html` as well. On Prototir it loads the
current SDK, and the imported one finds it already running and uses it, so your build gets new
testing tools without being rebuilt. Hosted elsewhere, where `/prototir.js` is absent, the copy
bundled from npm runs instead. Types are included. See the
[Babylon.js starter](https://github.com/prototir/web-examples/tree/main/babylon-vite-starter) for a
complete Vite setup.

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

Call `ready()` when the prototype is genuinely interactive, not while it is still showing a loader.
Event names are normalized to lowercase and must contain 1-64 letters, numbers, `_`, `.`, `:` or
`-`. Keep event payloads small and free of personal data.

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
| `review.enable(options)` | Configures Feedback & tools (on Prototir it is already on; see below). |
| `review.disable()` | Removes the control and cancels pending requests. |
| `review.open()` | Opens screenshot feedback from your own UI, for example a pause menu. |
| `review.capture()` | Takes a screenshot now and opens the composer. |
| `review.compose(input)` | Opens the composer prefilled with text, context or an image. |
| `review.comment()` | Opens a comment with no screenshot. |
| `review.tool(name, on)` | Opens or closes the `console` or `performance` panel. |
| `review.consoleText()` | The console recorded since load, one line per entry. |
| `review.on(event, handler)` | Subscribes to `open`, `close`, `submit`, `error`. Returns an unsubscribe. |

Storage keys may contain up to 128 characters, and each value up to 64 KiB of UTF-8. A prototype
never needs service credentials: managed AI routing, moderation and allowances are handled by
Prototir. Enable AI in `prototir.json` with `"ai": { "mode": "managed" }` and handle rejected
requests by their `{ code, message }` value.

## Feedback & tools

Testers get one **Feedback & tools** control. Its tools unfold inside the same border:

- **Screenshot** captures the moment; the tester places a pin and writes what they mean.
- **Comment** is a plain comment on the prototype.
- **Console** is recorded from load (the last 300 messages and uncaught errors). Testers can copy it
  or attach it to a comment, where it shows collapsed.
- **Performance** charts frame rate, slowest frame and memory, and runs only while open. A summary
  can be copied or attached.

A screenshot, log or summary is always sent with a message: it is what the comment is about, never
a comment on its own. Comments follow the prototype's ordinary moderation and comment settings, and
turning comments off for a prototype turns feedback off with it.

### Where the control appears

On Prototir the player draws it: beside Restart and Fullscreen, or inside the Prototir badge in
embeds. The SDK stays out of the way and drives the tools inside your frame. Feedback is on by
default; the player tells the SDK which prototype it is showing, so there is nothing to call.

Hosted anywhere else, the SDK draws the control itself, bottom-left by default, once you say where
comments go:

```js
Prototir.review.enable({
  project: 'orbit-garden',
  apiBase: 'https://api.prototir.com/api',
  slug: 'orbit-garden',         // the prototype's slug on Prototir
  corner: 'bottom-left',        // also bottom-right, top-left, top-right
  offset: 16,                   // pixels from the corner, to clear your own controls
  onOpenChange: (open) => setPaused(open)
});
```

The first post asks the tester to approve the build at prototir.com/link; comments then post as
that account. Without `apiBase` and `slug`, a self-hosted build shows no feedback control, because
comments would have nowhere to go.

### Choosing tools

Every tool is on by default. Switch any of them off, or pass `false` for none:

```js
Prototir.review.enable({ project: 'orbit-garden', tools: { console: false, performance: false } });
```

Console recording starts when the SDK loads, so turning the Console off also stops the recording.

### Driving it from your game

```js
review.capture();                          // screenshot now, open the composer
review.compose({                           // or hand the tester a report already written
  text: 'Stuck here.',
  context: `gate 3, seed ${seed}`
});
review.on('submit', () => resumeGame());   // also 'open', 'close', 'error'
```

`compose` accepts an `image` data URL when your game has a better frame than a live capture: the
frame before a crash, or a rendered diff. Without a `capture` option the SDK grabs the first
`<canvas>` on the next animation frame. Supply `capture` for an exact frame, a WebGL context created
without `preserveDrawingBuffer`, or a page that is not canvas-based; return a `Blob` or a
PNG/JPEG/WebP data URL. Screenshots are resized to 1280px on the long edge and sent as JPEG.

Use `context: () => ...` to record what a screenshot alone cannot: level, seed, elapsed time,
build. A pin on a procedurally generated scene is only reproducible if you write down what
generated it.

The panels follow the player's light/dark preference; pass `theme: 'light'` or `'dark'` to pin it.
Prototir's colours are bundled, so they look right inside a sandboxed frame with no network.

## Pointer lock and Escape

Pointer lock is a browser API and needs no SDK method. Request it from a player action, read mouse
deltas only while the canvas is locked, and pause or show a resume action when Escape releases it:

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

Do not imitate pointer lock with `cursor: none`; that only hides the cursor.

## Protocol and security model

`src/protocol.ts` defines protocol version 1. Because the iframe intentionally has an opaque origin,
the player validates messages by frame identity. The player supplies its origin through the
`prototir_origin` URL parameter so replies can use a specific target origin. The SDK accepts host
messages only from `window.parent` and only when their source and protocol version match.

## Develop

Requires Node.js 20 or newer.

```bash
npm ci
npm run check
npm run build:cdn
```

`npm run build` produces an IIFE build, an ES module, declarations and source maps in `dist`.
`npm run sync:review` copies the build into the Prototir player and the Unity and Godot SDKs, which
bundle it for their web exports.

### Releasing

Bump `version` in `package.json` and `CHANGELOG.md`, then push to `main`. The deploy uploads
`sdk/vX.Y.Z/` (immutable) and refreshes the `sdk/v0/` channel. A version that is already on the CDN
is never overwritten: the deploy skips it with a warning, so bump the version to release changes.
Then tag `vX.Y.Z` and publish a GitHub release.

Runnable starter projects live in [web-examples](https://github.com/prototir/web-examples). See the
[creator documentation](https://prototir.com/docs/creators?runtime=web#setup) for bundle and
publishing requirements.

## License

[MIT](LICENSE.md)
