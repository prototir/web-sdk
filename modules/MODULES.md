# Prototir Modules — design + catalog (D22)

Curated, versioned, **platform-served** building blocks that prototypes can declare in
`prototir.json`. Three layers plus one special class:

1. **Libraries** — third-party runtimes (three, phaser, onnxruntime-web, …).
2. **Model packs** — inference weights (RF-DETR, Whisper-tiny, …) served like any other
   module asset: the browser downloads them **once from the CDN and caches them across
   every prototype** that uses them. Uploads stay tiny; a 30 MB detector doesn't live in
   anyone's bundle.
3. **Prefabs** — Prototir-built drop-in scaffolds on top of the libraries (FPS rig,
   webcam-CV loop, AI NPC). The "get to fun in 20 lines" layer.
4. **Capabilities** — things that are *not* downloads but SDK bridges through the Player
   Shell: `Prototir.ai`, `Prototir.storage`, camera/mic consent. They exist because of
   the sandbox (below).

**Templates** are full starter prototypes published by the official Prototir account as
open-source — the existing **fork/download** flow (§8) *is* the template system.

## Why this can't just be npm

Prototypes run in a sandboxed iframe under a strict CSP: `script-src 'self'` + the
Prototir CDN, and **`connect-src 'none'`** — no fetch, no sockets, no runtime package
installs, no calls to third-party APIs. That constraint is the product (containment,
§7); modules are designed around it:

- **Serving:** immutable versioned paths — `cdn.prototir.com/modules/{name}@{version}/…`
  — with SRI hashes. The registry (`modules.json`, this folder) is the source of truth.
- **Declaration:** `prototir.json` → `"modules": ["three@0.170.0", "prefab-fps-rig@0.1.0"]`.
  At upload, the pipeline validates names/versions against the registry and **injects an
  import map** into `index.html`, so creators write `import * as THREE from 'three'` —
  exact npm dev parity without npm at runtime.
- **Local dev:** `npm create prototir` scaffolds a template whose import map points at
  the same module URLs; the SDK's dev server serves `/modules/` locally.
- **CSP delta needed:** `connect-src https://cdn.prototir.com` (GET-only asset host —
  weights/wasm must be fetchable), `worker-src blob:` and `'wasm-unsafe-eval'` for the
  inference runtimes. Exfiltration stays closed: the only reachable host serves static
  GETs.
- **Camera/mic:** declared as `"permissions": ["camera"]` in the manifest; the shell
  shows a consent prompt and only then sets `allow="camera"` on the iframe.
- **AI:** the sandbox can't call any model API. `Prototir.ai.chat(...)` goes
  `postMessage → Player Shell → webapp server → platform LLM key`, with per-tier quotas
  (Free: small daily allowance · Pro: bigger · Team: pooled), Content-Safety moderation
  on prompts/replies, and per-session metering. AI becomes a **platform feature and a
  Pro upsell**, not a hole in the sandbox.

## License gate

Only **MIT / Apache-2.0 / BSD / ISC** (LGPL case-by-case, served unmodified). **Never
AGPL** — that excludes YOLOv8 (use RF-DETR / RT-DETR, Apache-2.0) and hydra-synth.
GSAP excluded (proprietary license restricts self-CDN redistribution) — `motion` (MIT)
covers it.

## Catalog

See `modules.json` for the machine-readable registry — each entry carries a
**`status`** (`available` = servable today · `planned` = catalogued only). Prefab API
reference + customization recipes (e.g. swapping the third-person puppet for your own
GLTF): **`PREFABS.md`**.

**Curated on purpose (PLAN D23):** an entry earns its place by saving real bytes
(shared modules are cached across every prototype — bundles never re-ship a runtime) or
by encoding a platform constraint (consent, CSP, brokered capabilities, honest mobile
input). Things AI-assisted creators write trivially from the raw libraries — 2D game
kits over phaser, UI scaffolds, thin wrappers — and duplicate stacks (tfjs next to
onnxruntime, rapier2d next to matter, nipplejs next to prefab-input) stay out. Summary:

| Category | Libraries | Models | Prefabs | Template |
| --- | --- | --- | --- | --- |
| **core** | three · pixi · lil-gui | — | **input** | — |
| **game** | phaser · rapier3d · matter | — | **fps-rig** · **thirdperson-rig** · **audio** | 3d-thirdperson |
| **app** | chart · d3 · motion | — | — | — |
| **art** | p5 (2.x) · tone · simplex-noise | — | **shader-canvas** · **sketch** · **audio-features** | — |
| **cv** | onnxruntime-web · transformers · mediapipe-vision | **rf-detr-nano** · depth-anything-small | **webcam-cv** · hand-controls | webcam-detector |
| **ai** | — | whisper-tiny (local ASR) | ai-npc · voice-input | ai-chat-toy |

(Bold prefabs = built and servable today.) **Replaced per D23** — unmaintained/duplicative
externals swapped for Prototir-built: `seedrandom` → SDK **`Prototir.rng(seed)`**
(deterministic runs are a platform primitive now), `howler` → **`prefab-audio`** (raw Web
Audio, ~2KB), `meyda` → **`prefab-audio-features`** (native AnalyserNode, ~2KB); p5 bumped
to 2.x with **`prefab-sketch`** (~1KB) as the byte-light art path.

## Naming & kinds (how creators tell things apart)

The name prefix *is* the taxonomy — no docs needed to know what something is:

- **bare npm name** (`three`, `phaser`, `d3`) = third-party **library**; you `import` it
  exactly like from npm.
- **`prefab-…`** = Prototir-built scaffold; exports one **`create<Noun>()`** factory
  returning a handle with `destroy()` (see PREFABS.md for the full convention).
- **`model-…`** = weights pack (data, no code); pairs with a runtime lib.
- **`template-…`** = official **forkable starter prototype** — it never appears in an
  import map; you fork it from its prototype page (§8 flow).
- **`capability-…`** = SDK-brokered platform feature (`Prototir.storage`, `Prototir.ai`,
  `Prototir.rng`); nothing to download, version is `sdk`.

Human-browsable catalog: the webapp's **`/modules`** page (grouped by kind + genre with
status/size/permissions). Machine-readable: `modules.json` (this repo) → served as
`/modules/registry.json`.

## Rollout

1. **Phase 1 (local, pure code):** registry JSON + sandbox server serves `/modules/`;
   upload validates `"modules"` and injects the import map; vendor 2–3 libraries
   (three, rapier, onnxruntime-web) + 1 prefab; publish 1 template as a forkable
   official prototype. `Prototir.storage` in the SDK/shell.
2. **Phase 2 (Azure):** modules move to the real CDN (immutable cache headers — this is
   also the egress lever from D21); SRI enforced by the worker pipeline.
3. **Phase 3 (AI broker):** `Prototir.ai` shell bridge + webapp proxy + tier quotas
   (needs platform LLM keys — Manual Action).
4. **Phase 4:** `/modules` catalog page in the webapp; per-module usage stats in creator
   analytics (which modules correlate with real sessions).
