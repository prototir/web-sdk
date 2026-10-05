# Changelog

## 0.4.0 - 2026-10-05

- **Published on npm** as `@prototir/web-sdk`: `npm install @prototir/web-sdk`, then
  `import { Prototir } from '@prototir/web-sdk'`, with TypeScript types included.
- **A second copy defers to the first.** When the page already runs the SDK (on Prototir,
  `/prototir.js` serves the current one), an imported or duplicate copy uses that instance instead
  of starting its own: one console recorder, one connection to the player, and a build that
  bundles the SDK from npm still gets new testing tools without a rebuild. Keep
  `<script src="/prototir.js"></script>` in your `index.html` for that.
- New starters in web-examples: Phaser, PixiJS, and Babylon.js with Vite and npm.

## 0.3.1 - 2026-10-05

- **Copy works inside the Prototir player.** The Console and Performance panels' Copy buttons used
  the clipboard API, which a prototype's frame is not allowed to use, so they failed with a
  permissions-policy violation. They now fall back to the browser's copy command for the click that
  asked for it, without warnings, and say "Copy failed" if even that is refused. The frame is
  deliberately still not granted clipboard access, so a prototype cannot overwrite people's
  clipboards on its own.

## 0.3.0 - 2026-10-04

- **Staying current.** Prototypes on Prototir already load the current SDK from `/prototir.js`.
  For builds hosted elsewhere, `https://cdn.prototir.com/sdk/v0/prototir.js` now follows the newest
  0.x release within minutes; the versioned addresses stay pinned and immutable. On Prototir, the
  copy that Unity and Godot web exports bundle is also replaced with the current SDK, so their
  testers get new tools without the build being exported again.
- **Feedback & tools.** One bordered control whose tools unfold inside it (no floating menu):
  Screenshot, Comment (text only), Console and Performance.
  - Console records from load (the last 300 messages and uncaught errors, formatted cheaply).
  - Performance charts frame rate, slowest frame and memory, and runs only while open.
  - Both panels offer Copy and Attach to comment; a message is always required.
  - `tools: { console: false, … }` or `tools: false` turns tools off.
  - New API: `review.comment()`, `review.tool()`, `review.consoleText()`.
- Feedback is offered only where it reaches Prototir: hosted on Prototir, or a self-hosted build
  given `apiBase` and `slug`. Without either, the button, `review.open()` and `review.capture()`
  do nothing, and "Review files" (offline review documents) is no longer offered. Offline review
  files are paused, not removed.
- The feedback button now uses the colours of the Prototir badge (raised surface and border)
  instead of accent blue, and an accordion chevron in place of the plain square: it points the way
  the menu opens and turns around while it is open.
- The bundled theme matches the website's current palette again (the theme check had caught it
  drifting after the website's palette update).

## 0.2.8 - 2026-09-28

- Hosted captures open one Prototir-owned composer for the pin, context and comment. Posting, sign-in and draft recovery stay on the host; SDK open/close hooks still let a game pause.
- Self-hosted builds retain the portable review tools. Hosts that do not advertise the new composer keep the existing protocol.

## 0.2.6 - 2026-09-27

- Kept Post visible in the short hosted watch-page player by anchoring it to the bottom of the
  scrolling screenshot composer. A live Backpack Viewer check caught it partly below the panel
  after the 0.2.5 menu release; the larger test frame had hidden the problem.

## 0.2.5 - 2026-09-27

- Split screenshot feedback into icon-led tools. The SDK badge opens Screenshot and Review files
  when offline, or Screenshot and Comments when hosted. Screenshot opens a focused composer;
  capture failure reveals Attach as a recovery option. Hosted players now command a capture
  directly after their own tool menu selection.
- Moved review-file import/export and the saved thread list behind Review files. Hosted comments
  continue through the existing Prototir comment API and confirmation dialog.
- Kept the Feedback badge legible on hover and sized hosted previews so Post remains visible.

## 0.2.4 - 2026-09-27

- Replaced the feedback panel's font-rendered close glyph with a centered SVG X. The text glyph
  appeared off-center inside its button even though the button used grid centering.

## 0.2.3 - 2026-09-27

- Moved the screenshot feedback panel's Close control to a cross at its top-right edge, with an
  accessible name. The panel toolbar now starts with Capture view.

## 0.2.2 - 2026-09-27

- Fixed feedback enabling itself before there was a document to draw into. The SDK is normally
  loaded from `<head>` with no `defer`, so on a microtask `document.body` is still null and
  `enable()` died half-built: it had already set its options, so the SDK reported feedback as on
  while no overlay existed and the hello that makes the host show its Feedback control was never
  sent. It now waits for `DOMContentLoaded`.

## 0.2.1 - 2026-09-23

- Feedback now switches itself on when the host names the prototype, so adding the SDK is enough:
  the player passes `prototir_slug` into the frame and the SDK enables review with it. An explicit
  `review.enable()` from the build still replaces it, and the creator's dashboard policy still
  decides whether feedback is offered at all.
- Exported `resolveHostProject()`, so an engine adapter reads the prototype the same way the
  browser SDK does rather than restating the rule.
- Replaced a `queueMicrotask` call with a resolved promise. This SDK runs inside engine webviews
  as well as browsers, and the narrower the assumptions about the host environment the better.

## 0.1.0 - 2026-08-26

- Initial public Web SDK for protocol version 1.
- Added readiness, analytics events, scores, persistent storage, and managed text generation.
- Added deterministic seeded random numbers and runtime input validation.
- Added IIFE, ES module, TypeScript declaration, and integrity-manifest builds.
