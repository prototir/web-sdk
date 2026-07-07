# prototir-sdk — Claude Code notes

The **Prototir player SDK** (postMessage bridge prototypes load as `/prototir.js`),
the **module/prefab registry**, and the local example prototypes. **The living plan is
`../prototir-webapp/PLAN.md`** (§16, decisions D22/D23).

## Build / verify

```bash
npm ci
npm run build      # tsup → dist/prototir.js (+ .mjs) — the sandbox serves dist/ directly
```

## What lives here

- `src/index.ts` — the `Prototir` global: `ready() / event() / score()`,
  `storage` (shell-brokered, request/response ids + 3s timeout), `rng(seed)`
  (deterministic sfc32). `src/protocol.ts` is the message protocol — **the webapp
  keeps a vendored copy in PlayerShell; update both sides together.**
- `modules/modules.json` — **source of truth** for the module catalog (D22/D23:
  curated; each entry `status: available|planned`; kind prefixes ARE the taxonomy:
  bare npm name = lib, `prefab-`, `model-`, `template-`, `capability-`). After editing:
  `cp modules/modules.json ../prototir-sandbox/modules/registry.json` and mirror
  servable entries in `../prototir-api/Modules/ModuleRegistry.cs`.
- `modules/MODULES.md` (system design + catalog) · `modules/PREFABS.md` (prefab
  conventions + full API docs — keep in lockstep with prefab code in
  `../prototir-sandbox/modules/`).
- `examples/*` — local stand-in prototypes served by the sandbox; each with an inline
  importmap MUST have a matching `.csp.json` (sha256 of the exact importmap JSON).

## D23 bar for new catalog entries

A module earns its place only by (a) saving real bytes via the shared cache, or
(b) encoding a platform constraint (CSP, consent, brokered capability). AI-trivial
wrappers and duplicate stacks stay out.
