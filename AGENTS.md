# Chorono repository instructions

## Software engineering standards

These are the repository's canonical coding rules, agreed on 6 November 2026. They apply to new work and relevant changes to existing code. Keep Claude/Codex instructions and technical documentation consistent with this section. A future maintainer must be able to understand the implementation from the repository without private chat history or agent memory.

### SOLID and responsibility boundaries

- **Single responsibility:** Give each class, function and module one cohesive reason to change. Separate domain calculations, conversion, persistence, rendering, UI interaction and job orchestration.
- **Open/closed:** Put genuinely variable algorithms and backends behind small contracts and strategies. Add an implementation through that contract; avoid duplicating the caller's workflow for each algorithm.
- **Liskov substitution:** Implementations preserve the contract's input/output meaning, units, ownership, mutation, ordering and failure behavior. A backend that cannot satisfy a capability reports that explicitly.
- **Interface segregation:** Consumers depend on the operations they use. Keep geometry queries, rendering, asset loading and solver control distinct rather than requiring every implementation to support all operations.
- **Dependency inversion:** Domain services depend on contracts; composition/bootstrap supplies storage, renderer and platform implementations. Keep React, browser/GPU handles, transport and filesystem details out of reusable numerical code.
- Use purposeful class hierarchies with an abstract base for shared behavior. Prefer composition for interchangeable policies. Stateless mathematical helpers and immutable data records may remain functions/types; do not add a class hierarchy without a real responsibility.
- Encapsulate mutable class state with private fields and meaningful accessors/operations. Expose readonly data where appropriate. Accessors must preserve invariants; avoid unrestricted setters that bypass validation or ownership.

### Module, package and directory ownership

- Each feature or package owns its implementation in a cohesive directory, including its types, algorithms, adapters, converters and tests where needed. Add subdirectories as responsibilities emerge; do not scatter a feature across unrelated utility folders.
- Extend existing feature roots first, such as `src/lib/geometry`, `spline`, `animation`, `render`, `asset`, `export`, `player` and `editor`. Feature-specific UI stays in the corresponding component/hook area.
- Use `core` for foundational contracts and lifecycle abstractions. Shared mathematics belongs in the geometry/math domain; feature business rules, React panels and concrete renderer/solver implementations do not belong in core.
- Put reusable utilities in focused utility classes/modules within their owning domain. Use an application-wide utility location only for genuinely domain-independent behavior. Keep responsibilities such as geometry, sorting, identifiers and collections separate; do not create a single catch-all utility class.
- Put representation conversion in named converter classes/modules near the owning domain, such as shape-to-path, contour-to-mesh or versioned scene conversion. Keep file/network loading, UI commands and simulation orchestration separate. Document conversion loss, coordinate/units changes and diagnostics.
- Application code uses a module's public contract. Limit cross-feature deep imports into implementation details. Keep dependency direction acyclic and use adapters at integration boundaries.
- A cohesive directory does not require a separate npm package. Create a workspace package only for a justified distribution, dependency or runtime boundary; preserve the existing CLI layout and generated-file workflow.
- Current `types/core.ts` and some `core` interfaces contain 2D dependencies. Treat neutral shared-core boundaries as a gradual extraction target; preserve old imports and serialized formats while migrating relevant code. Do not move the entire application merely to match a proposed directory tree.

### Reuse before creation

Before introducing a general function, algorithm, class or converter:

1. Search the repository with `rg`/`rg --files`, including the owning domain, existing utilities, converters and tests.
2. Read candidate implementations and their contracts. Reuse a suitable implementation from its existing owner instead of copying it.
3. If it lacks a needed capability, extend it with compatible semantics, options or an implementation of its existing contract. Cover the new behavior and preserved callers with meaningful checks.
4. If the required semantics cannot remain compatible, add a clearly named implementation or version, explain the difference and provide a migration/adapter where needed. Do not silently change existing callers.
5. Keep one authoritative implementation for each shared behavior. Route affected callers through it when within scope; document any deliberately staged migration.

For sorting, reuse the language/library operation or existing sorting utility when it satisfies the contract. Repeated domain rules such as keyframe ordering/tie handling belong in one domain helper/comparator. If distinct sorting algorithms are required, put each algorithm in its own implementation class/module behind a common strategy contract. Callers select the strategy without reimplementing sorting. Document stability, tie policy, mutation, input/output and relevant complexity; do not implement custom algorithms merely to wrap an ordinary sort call.

### Size and exceptions

- Target **at most 300 lines of implementation code per class**. Documentation, blank lines and generated code are excluded from this implementation-size target; substantial documentation is explicitly welcome.
- Keep files and functions cohesive as well. Do not hide excessive responsibility by putting many classes in one large file, moving methods into arbitrary fragments or introducing forwarding layers only to satisfy a line count.
- Split growing classes by responsibility, such as geometry algorithm, converter, resource owner and orchestration. Preserve their public contract during extraction.
- Exceptions are allowed for justified algorithm cohesion, generated/integration constraints, compatibility or measured performance. Explain the specific reason near the class and in the change description, including a follow-up boundary if relevant. Routine exceptions do not require a separate user approval step.
- Existing large files are migrated incrementally when the relevant responsibility is changed. This rule does not authorize an unrelated repository-wide rewrite.

### Class and function documentation

- Document new or materially changed classes and functions above their declarations using clear JSDoc/TSDoc. Documentation may be longer than the implementation when the contract needs it; the previous blanket prohibition on comments no longer applies.
- Class documentation explains responsibility, collaborators, invariants, lifecycle/resource ownership and intended use. State whether instances hold mutable state and what is shared between instances.
- Function documentation explains purpose, parameters, return value, preconditions, supported cases, mutation/side effects, failure/diagnostic behavior and important edge cases. State coordinate space, units, time basis, ordering and determinism where relevant.
- Numerical/geometry documentation states tolerances, degenerate cases, topology assumptions and algorithm limitations. Explain non-obvious derivations and link primary references when relying on a published method.
- Async/resource APIs document cancellation, stale results, acquire/release/dispose, cache invalidation and ownership of returned buffers. Converters document what is preserved, approximated or lost.
- Include examples when they resolve ambiguity. For short obvious private helpers, a precise contract sentence is sufficient; do not fill comments with repeated names or unsupported performance claims.
- Update documentation with behavior changes. Mark proposed APIs as proposals and document actual public paths/capabilities. Add inline explanations for non-obvious decisions, constraints and workarounds.

### Shared 2D / 2.5D and future mode foundations

- Reuse common calculations, topology, validation, resource management and meaningful rendering preparation across animation, boxed 3D content and future modes. Build shared code from concrete consumers; the active roadmap remains 2D/2.5D and does not activate a full game engine or 3D workspace.
- Keep topology connectivity separate from vertex positions, dimensional attributes, transforms and renderer state. A shared triangle/quad topology may serve 2D and 3D positions through explicit adapters. Keep UV, normals and solver rest data in appropriate typed payloads.
- Preserve explicit 2D affine and 3D matrix/projection contracts. Do not add z to every legacy 2D transform or use unrestricted casts to make incompatible vectors/renderers appear interchangeable.
- Share dimension-independent algorithms and buffer/command preparation where their semantics match. Canvas2D composition, GPU depth/camera/material evaluation and platform drawing remain backend adapters. One renderer is not assumed to satisfy every backend's capabilities.
- Keep fixed-topology mesh deformation distinct from variable-topology Blob/fluid surfaces. Reuse contour/triangulation helpers through contracts rather than forcing both into one incompatible cache format.
- Persist versioned serializable source data, stable IDs and cache/asset manifests. Keep runtime classes, DOM/GPU objects and dense per-frame buffers outside ordinary scene JSON and undo snapshots; manage their ownership and budgets explicitly.

### Verification and maintainer handoff

- Every change description explains the problem, owning module, reused/extended helpers, public contract changes, validation and material limitations. Explain justified size or architecture exceptions.
- For a new subsystem, document its entry points, dependencies, data flow, lifecycle, coordinate/time conventions and a minimal working usage example in repository documentation. Record architecture decisions that affect future consumers.
- Verify shared algorithms with meaningful invariants and edge cases; test affected adapters/old callers when changing contracts. Follow the implementation checks below and inspect real rendered output for rendering changes.
- Finish a new layer end to end: schema/defaults, commands, property controls, clone/instance, selection/bounds, renderer, portable save/load and supported runtime/export capabilities. A registry entry alone is not a completed layer.
- Keep code, examples, migration notes and public API/skill documentation synchronized. Repository files are the source of truth; agent memory is supplementary.

## Chorono MCP animation authoring

For animation work, prefer the connected Chorono MCP tools so the result stays editable in the browser. Software implementation changes still use the normal repository workflow.

- Start with `list_sessions`, `get_capabilities` and `chorono://scripting`. With multiple editors, choose a `sessionId` explicitly.
- Read `get_scene` before every source mutation. Pass its `revision` as `expectedRevision` and one-use `readToken` (five-minute lifetime). An outer `batch_actions` call authorizes all its sub-actions. Dry-run script plans return a new plan-bound `readToken` and revision for `apply_script_plan`. Reuse exact arguments and a stable `requestId` only for a transport retry; on source conflict read again and adapt to the current work.
- Preserve unrelated objects and animations. Optional `scene.authoring` v1 separates creation, latest field writers and inherited copy content. Missing records mean unknown; actor labels do not grant overwrite permission. Do not write actor flags into animation parameters or replace the editor-managed ledger. Give new objects meaningful names and use their returned ids in subsequent calls.
- Use explicit timeline ids for multiple animations. `scene.useTimeline(id)` controls Layer.key; Timeline.key always targets that timeline.
- Use `run_script` for procedural creation and `batch_actions` for related native changes. Script dry runs return a planId; commit that plan instead of rerunning code.
- Never execute model-generated code through Node, eval, new Function or the legacy authoring console. MCP scripts run in the isolated QuickJS bridge.
- Use the actual property schemas for effects, masks, geometry, typography, particles and repeaters. Do not invent undocumented API methods.
- Inspect real `render_preview` images at representative times. `evaluate_frame` checks values, not visual quality. Use timelineIds to isolate animations and [] to restore all in control_playback.
- Validate and save a portable project. Report the actual saved path and any exporter warnings.

See [docs/tr/mcp.md](docs/tr/mcp.md) for installation, tool coverage and limits. Run `npm test`, `npm run mcp:build` and `npm run build` for implementation changes. Stop the Next dev/production server before building.

Canonical distributable skills live in `skills/`; update them alongside MCP API/workflow changes. `packages/cli/skills` is generated by `npm run cli:build`; do not edit it directly. For installer changes, also run `npm run cli:test` and inspect/test the tarball from `npm run cli:pack`. The editor root stays private; publish only the CLI workspace when publication is explicitly requested. See [docs/tr/skills.md](docs/tr/skills.md).

The CLI lifecycle is `chorono setup`, `start`, `doctor`, `stop`. Use `npm run chorono -- ...` from the source checkout. `setup` preserves existing checkouts/client entries; a stale client entry requires review. Never build or reinstall dependencies while its Next server runs. `start --background --json` is suitable for an agent; inspect `doctor --json` before authoring and connect through the browser's MCP control. Do not infer a connected editor merely from a healthy HTTP endpoint.
