# Changelog

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
