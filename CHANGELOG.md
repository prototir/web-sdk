# Changelog

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
