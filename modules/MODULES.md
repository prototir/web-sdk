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
GLTF): **`PREFABS.md`**. Summary:

| Category | Libraries | Models | Prefabs | Template |
| --- | --- | --- | --- | --- |
| **core** | three · pixi · lil-gui · seedrandom | — | — | — |
| **game** | phaser · rapier3d/2d · matter · howler · nipplejs · rot | — | fps-rig · thirdperson-rig · platformer-2d · topdown-2d · vehicle-rig | 3d-thirdperson · 2d-platformer |
| **app** | preact · tailwind-play · chart · d3 · motion | — | — | touch-app |
| **art** | p5 · tone · meyda · simplex-noise | — | audio-reactive · shader-canvas | audio-visualizer |
| **cv** | onnxruntime-web · transformers · mediapipe-vision · tfjs | **rf-detr-nano** · coco-ssd · depth-anything-small | webcam-cv · hand-controls | webcam-detector |
| **ai** | — | whisper-tiny (local ASR) | ai-npc · voice-input | ai-chat-toy |

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
