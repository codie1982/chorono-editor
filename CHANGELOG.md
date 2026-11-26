# Changelog

## [0.5.0] — release candidate

- Create Mesh2D layers from grids, closed shapes and splines. Edit texture
  placement and pins, and play baked mesh deformation from portable projects.
- Review track, rigid-body and fracture bakes in Jobs & Bake. Apply a job in
  one Undo step, and use ownership checks when replacing or clearing its output.
- Bake deterministic Voronoi fracture for shapes, splines and textured meshes,
  including complex regions, breakable bonds and recursive secondary events.
- Render PNG or a PNG sequence with the built-in renderer. A running local
  Chorono Render service can receive the sequence for MP4 finishing.

[Release notes](docs/releases/v0.5.0.md) · [Türkçe](docs/tr/releases/v0.5.0.md) · [Validation and limitations](docs/releases/v0.5.0-validation.md)

## [0.4.0] — 2026-11-17

Added editable spline modeling and restored 2D precision workflows.

- Offset/Outline creates independent parallel contours and bands; Chamfer/Fillet trims selected corners. A Spline Modeling panel provides Preview, Apply and Cancel with one-step Undo, stale-source checks and animation conflict rejection.
- Matching `layer.spline` scripting/MCP calls reuse the modeling geometry and return a sibling layer ID for Offset/Outline.
- Selection-based Agent handoff copies a short-lived MCP focus prompt without changing scene authorization.
- Unified Snap/Grid controls, independent Rotate/Scale settings, Shortcuts window, Motion Keys dock and corrected 2D move/resize/rotate feedback.
- Existing editable spline storage/render paths are reused. Curved edges are sampled; curved Fillet uses a tangent cubic approximation. Other reported Point/Edge/Object, Boolean and topology workflows are outside this release claim.

[Release notes](docs/releases/v0.4.0.md) · [Türkçe](docs/tr/releases/v0.4.0.md) · [Validation and limitations](docs/releases/v0.4.0-validation.md)

## [0.3.0] — 2026-11-12

Completed pre-3D editing and agent collaboration workflows.

- Pivot/selection/pointer-release fixes, viewport motion-key editing, safe animated
  subtree drag-copy and multi-selection Array with preview/Apply/Cancel/one undo.
- Editable neighbor gaps, persistent ruler guides, off-artboard outlines and
  synchronized Pan controls; grouped toolbar and contextual spline tools.
- Shared hierarchy, explicit Timeline reveal/isolation, Set Key, batch key editing,
  transport navigation and procedural curve preview/bake.
- Typed live property expressions, saved formulas, Calculate once and explicit
  fallback/convert/bake flows with shared evaluation/output contracts.
- Local autosave/session recovery and bounded persisted Undo/Redo by session ID;
  updated startup demo and 58 contextual documentation targets.
- Mandatory fresh scene reads and revision/read-token authorization for MCP edits,
  human/agent field provenance, compatible aliases and typed tool documentation.
- Consented anonymous diagnostic summaries, receiver/storage/version checks and
  grouped issue management with status and repeat counts.
- Preserved current main MCP metadata while retaining newer typed-key/source-guard
  semantics; documented capabilities and deferred 3D/export/CFX work explicitly.

[Release notes](docs/releases/v0.3.0.md) ·
[Türkçe](docs/tr/releases/v0.3.0.md) ·
[Validation and limitations](docs/releases/v0.3.0-validation.md)

## [0.2.0] — 2026-11-08

Chorono's large-scene optimization and resource-lifecycle release. Includes the
editor, scripting/audio/spline improvements and technical documentation developed
since the initial source release.

- Indexed scene relationships and tracks; dependency-safe viewport culling,
  bounded static-group LOD, reused scratch surfaces and mask/effect ROI.
- Shared resource budgets, bounded preparation queues, demand-driven image/video/
  audio/font residency, source URL ownership and explicit cleanup/cancellation.
- Bounded import, decode and output pipelines, including actual-consumption
  ownership for downloads, clipboard, persistence and MCP responses.
- Virtualized layer/timeline/dope-sheet/asset views and dense keyframe glyphs.
- Fixed Solo-parent descendant visibility in Timeline and Scene Explorer;
  added recursive expand/collapse/show/hide commands with atomic visibility undo.
- English Resources & Performance panel and an event-driven Last draw/Heap
  viewport indicator; fixed paused monitors retaining previous project graphs.
- Expanded editable scripting handles, native audio controls, spline editing,
  independent timeline behavior and rendering/runtime regression coverage.
- Updated onboarding, editable examples, agent skills, roadmap and maintainer docs.

Read the [full release notes](docs/releases/v0.2.0.md),
[Türkçe sürüm notları](docs/tr/releases/v0.2.0.md) and
[validation report](docs/releases/v0.2.0-validation.md) for scope and limitations.

## [0.1.0] — 2026-11-08

Initial GitHub source pre-release: local-first 2D editor, MCP authoring workflow,
CLI lifecycle, bundled skills, editable example and English/Turkish setup guides.

[0.2.0]: https://github.com/codie1982/chorono-editor/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/codie1982/chorono-editor/releases/tag/v0.1.0

[0.3.0]: https://github.com/codie1982/chorono-editor/compare/v0.2.0...v0.3.0
[0.4.0]: https://github.com/codie1982/chorono-editor/compare/v0.3.0...v0.4.0
