# Prototir Web SDK

The official browser SDK for prototypes hosted on [Prototir](https://prototir.com). It provides a
small, typed API for lifecycle signals, analytics events, scores, persistent storage, managed text
generation, and deterministic random numbers.

Prototypes run in a sandboxed iframe. The SDK communicates only with the parent Prototir player by
using a versioned `postMessage` protocol; it does not contain credentials or contact external APIs.

## Add the SDK

For a plain HTML bundle, include the immutable CDN build before your application script:

```html
<script src="https://cdn.prototir.com/sdk/v0.2.0/prototir.js"></script>
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
| `review.enable(options)` | Shows the floating feedback button and screenshot annotation panel. |
| `review.disable()` | Removes the overlay and cancels pending requests. |
| `review.open()` | Opens the panel from your own UI, for example a pause menu. |
| `review.importDocument(text)` | Loads a `.prototir-review.json` file a tester sent you. |
| `review.exportDocument()` | Returns the current review as JSON text. |
| `review.attach(dataUrl)` | Supplies a screenshot captured by an engine and opens the panel. |
| `review.capture()` | Takes a screenshot now and opens the composer. |
| `review.compose(input)` | Opens the composer prefilled with text, context, or an image. |
| `review.on(event, handler)` | Subscribes to `open`, `close`, `submit`, `error`. Returns an unsubscribe. |

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

## Screenshot feedback

Review mode gives testers a floating button that captures the current view, lets them drop a pin on
that screenshot and write a comment. It is opt-in, and it works both on Prototir and on a prototype
you host yourself.

```js
Prototir.review.enable({
  project: 'orbit-garden',   // stable ID; reviews from other projects are refused
  build: 'v1.4.0',           // shown with imported feedback
  corner: 'bottom-left',     // default; also top-left, top-right, bottom-right
  offset: 16,                // pixels from the corner, for clearing your own controls
  capture: async () => renderer.domElement.toDataURL('image/png'),
  context: () => `level ${level}, seed ${seed}`,
  onOpenChange: (open) => setPaused(open)
});
```

### Where the button appears

By default the SDK decides for you. Inside the Prototir player, Prototir draws **Feedback** in its
own control bar beside Restart and Fullscreen, and the SDK stays out of the way. Anywhere else the
SDK shows the Prototir mark, which opens a small menu: **Screenshot & comment**, **Comments**, and
**Open on Prototir**. The menu unfolds from the mark, so the trigger never moves.

Set `launcher: 'watermark'` to always show the mark, or `launcher: 'host'` to draw nothing and call
`review.open()` from your own UI.

The panel follows the player's light/dark preference. Pass `theme: 'light'` or `'dark'` to pin it.
Prototir's own colours are bundled, so the panel looks right offline and inside a sandboxed frame
with no network access.

### Driving it from your game

The one-line setup is enough for most prototypes. When you want the game itself to raise feedback:

```js
review.capture();                          // screenshot now, open the composer
review.compose({                           // or hand the tester a report already written
  text: 'Stuck here.',
  context: `gate 3, seed ${seed}`
});
review.on('submit', () => resumeGame());   // also 'open', 'close', 'error'
```

`compose` accepts an `image` data URL when your game has a better frame than a live capture would
give: the frame before a crash, or a rendered diff. The case this exists for is a game noticing its
own failure and filing the report itself, which is feedback nobody would have written by hand.

Without `capture`, the SDK grabs the first `<canvas>` on the next animation frame. Supply `capture`
whenever you need an exact frame, a WebGL context created without `preserveDrawingBuffer`, or a page
that is not canvas-based. Return a `Blob` or a PNG/JPEG/WebP data URL. Screenshots are resized to
1280px on the long edge and re-encoded as JPEG before they leave the browser.

Use `context` to record what a screenshot alone cannot: level, seed, elapsed time, build. A pin on a
procedurally generated scene is only reproducible if you write down what generated it.

### On Prototir and off it

Inside the Prototir player the panel posts to the prototype's ordinary comment section, so screenshot
feedback sits with every other comment and follows the same moderation and creator wall controls.
Prototir shows its own confirmation dialog, with the image, before anything is posted under the
tester's account: an embedded experience cannot post on its own.

Hosted anywhere else, the panel keeps the review in the browser and in a file. **Save review file**
writes `feedback.prototir-review.json`, which the tester sends you and you reload with **Import
review**. Where the browser supports it the same file is reopened and saved in place; elsewhere it
downloads a fresh copy. Drafts are also kept in IndexedDB per project and build, so a reload does not
lose work, but a file is the only durable copy.

The document holds the screenshots, pins, comments, replies and resolved state. It is data only:
images must be inline PNG/JPEG/WebP data URLs, so an imported review can never fetch a remote URL or
carry markup. Author names in a file come from the tester and are unverified.

Limits: 100 screenshots per review, 100 replies per screenshot, 2000 characters per comment, 8 MiB
per file.

### Team cloud reviews

Pass `cloudUrl` to add a **Team cloud** button linking to a shared review workspace, where a paid
team imports a file once and then opens and saves it without passing files around. Saves are checked
against a revision so one teammate cannot silently overwrite another.

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
