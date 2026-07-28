# Module demo prototypes

These folders are upload-ready Prototir bundles. They intentionally omit hand-written import
maps: the production upload pipeline validates `prototir.json.modules` and injects the canonical
CDN mapping.

Publish each demo from the ordinary Prototir creator account with these Studio settings:

- visibility: **Unlisted**
- source: **Open source**
- template: **Off**
- comments: **Off**
- tips: **Off**

After the prototype is Live, open the Prototir admin panel and link each demonstrated module to the
prototype by pasting its public Prototir URL. The association lives in the platform database, so it
can be changed without editing or redeploying the module registry.

Every demo is both a functional prototype and the complete reference for the published module
version. Reuse the same Module Lab information architecture, terminology, typography, color tokens,
status treatment, telemetry, and responsive behavior so the collection reads as one Prototir-made
documentation system rather than unrelated examples.

Each demo must contain:

1. an immediately understandable live result;
2. concise controls and a small task for the visitor;
3. live telemetry that proves the module is doing the work;
4. what the module provides and when it is useful;
5. a complete API reference for that version: every export, option, callback, callback-state field,
   return value, public property, default, unit, and lifecycle method;
6. a representative minimum code excerpt that matches the running result;
7. responsive keyboard, pointer, and touch behavior where applicable;
8. explicit permissions, device support, version, size, and license metadata.

The live result and documentation must agree. Never document planned APIs in a demo for an already
published version, and keep older version demos unchanged when a new immutable module version ships.
