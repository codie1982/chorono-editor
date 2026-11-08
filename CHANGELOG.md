# Changelog

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
