# prototir-sdk

The embeddable mini-SDK for **Prototir** prototypes. A prototype runs in a sandboxed
`<iframe>` on the sandbox origin and talks to the Prototir **Shell** (parent frame, app
origin) over `postMessage`. The Shell measures the *real session* and the prototype — boxed
in the iframe — can't fake it. See `../prototir-webapp/PLAN.md` §7 & §10.

## Usage (in a prototype)

```html
<script src="https://cdn.prototir.com/sdk/v1/prototir.js"></script>
<script>
	Prototir.ready(); // loaded & interactive — starts the session
	Prototir.event('level_complete', { level: 2 }); // milestone → analytics / points
	Prototir.score(1200); // optional score
</script>
```

That's the whole surface: `ready()`, `event(name, data?)`, `score(value)`.

## Protocol

`src/protocol.ts` is the source of truth: a versioned envelope
`{ source: 'prototir', v: 1, type, … }`. The webapp Shell keeps a small vendored copy
(`prototir-webapp/src/lib/player/protocol.ts`) — keep them in sync when bumping the version.

Because the prototype is sandboxed **without** `allow-same-origin`, it is an opaque origin:
its messages arrive at the Shell with `origin === "null"`, so the Shell validates by frame
identity (`event.source === iframe.contentWindow`), not origin string. The Shell passes its
own origin to the prototype via a `prototir_origin` query param so the SDK posts to it
(falls back to `*`).

## Develop

```bash
npm install
npm run build      # → dist/prototir.js (IIFE global) + dist/prototir.mjs (ESM) + types
npm run start      # build, then serve demo prototypes at http://localhost:8080/{slug}/
```

`tools/serve.mjs` mimics the sandbox origin: any `/{slug}/` serves the demo in
`examples/demo/`, and `/prototir.js` serves the built SDK. Port 8080 matches the API's
`Sandbox__BaseUrl`, so the webapp watch page loads these directly.
