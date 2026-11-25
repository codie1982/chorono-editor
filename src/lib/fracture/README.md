# Voronoi fracture foundation

This directory owns deterministic generation geometry, the portable FRACTURE2
bond-graph domain and the first FRACTURE3 precomputed parent→child hierarchy.
It does not own React controls, the Matter world, rendering or file I/O.

## Entry points and data flow

1. `FractureSourceBoundaryCompiler.compile` converts a root closed shape,
   closed spline, convex Mesh2D or image rectangle through the canonical
   Mesh2D boundary generators/validator. It extracts one ordered boundary ring and rejects open,
   branching, disconnected, holed or concave topology with an authoring
   diagnostic. Image rectangles preserve their historical four-corner source.
2. `VoronoiFractureGenerator.generate` validates the compiled convex polygon,
   realizes deterministic seeds with the compiler-owned PRNG, obtains cells
   from pinned `d3-delaunay@6.0.4`, clips them to the actual source, rejects
   slivers by retrying the whole generation and returns `FractureGeneration`.
3. `FractureManifestValidator.validate` verifies stored geometry, derived
   area/centroid/bounds and provenance without regenerating D3 cells. Saved
   polygons are authoritative across future library versions.
4. `RigidBodyLayerCompiler` adapts the source layer and rectangle environment
   bodies independently of recipe orchestration. `FractureRigidRecipeCompiler`
   supplies the compiled rectangle or convex-polygon source collider, then
   adds centroid-relative convex fragment colliders and either a fixed-tick or
   explicit-collider impact event.
5. `RigidBodyBakeAdapter` runs the extended `MatterPhysicsBackend`. At the
   event tick the source body is removed, fragment bodies are added, and each
   receives source linear velocity plus the angular tangential component.
   Impact jobs first realize the exact qualifying contact into immutable recipe
   evidence; unresolved impact placeholders cannot compile tracks or commit.
6. `FractureAppearanceCompiler` keeps solid convex shape/spline sources as
   editable paths and converts image rectangles into fixed-topology Mesh2D
   fragments. `FractureMesh2DClipper` clips each validated source triangle and
   interpolates authored UVs into the fragment topology. Image UVs
   stay normalized in the complete source-rectangle space; every fragment
   carries the same texture asset, fit mode and `textureReferenceBounds`.
7. `FractureAppearanceQualityAnalyzer` measures exact-event source/fragment
   alignment, preserved area, shared boundaries and triangle count. It reports
   current mask scratch and the existing four-surface full-frame alternative
   without confusing later physical separation with an event seam.
8. `FractureExplosionImpulseResolver` computes deterministic one-shot radial,
   directional and spin velocity deltas in stable fragment order. This is
   optional artistic external energy, not contact force or a per-frame field.
9. `makeApplyVoronoiFractureBakeCmd` creates the appropriate fragment layers,
   normal transform/visibility tracks, topology persistence and ownership
   atomically. Undo restores the exact prior layer, timeline and physics
   envelopes.
10. `FractureSharedBoundaryAnalyzer` measures length, midpoint and an oriented
    normal without changing the FRACTURE1 adjacency manifest. The
    `FractureBondGraphCompiler` adds automatic/manual overrides, seeded policy
    materialization and a portable hash. `FractureClusterComponents` resolves
    canonical intact components after any deterministic bond set is removed.
11. `FractureGenerationHierarchyCompiler` validates stable parent-fragment
    lineage and admits realized depth/generation/fragment/triangle/portable-byte
    usage. `FractureRecursiveRecipeCompiler` adds ordered fixed-tick child body
    replacement events to the same canonical Matter recipe.

## Contracts

- Geometry is source-layer local pixels with +Y down. Polygons have no repeated
  closing vertex, are strictly convex and use positive shoelace area.
- Simulation is composition pixels with +Y down and clockwise degrees. Recipe
  gravity remains metres/s² and uses an explicit pixels-per-metre conversion.
- Timed fracture uses local simulation milliseconds and must equal an interior
  integer fixed-step tick. Impact fracture requires a positive relative-normal
  speed threshold and one or more explicit static colliders; the first
  qualifying contact supplies exact tick, time, collider, point, normal and
  measured speed evidence. Preview samples can use a lower FPS that divides
  the solver rate.
- Runtime Matter objects and dense pose samples never enter scene JSON. The
  project stores realized topology, recipe provenance and generated track
  ownership; normal tracks drive player/render/export without a solver.
- Compiler v2 accepts a 1–116 character ASCII generation prefix and emits
  `generation-fragment-N` scene layer ids plus `generation-seed-N` seed ids.
  This keeps every generated layer inside the portable scene id contract.
  Compiler v1 manifests remain readable as topology data, but their legacy
  colon-delimited fragment ids cannot be inserted into a current scene.
- V1 supports one closed, hole-free, strictly convex root shape, spline or
  fixed-topology Mesh2D, or a root image rectangle with positive persisted
  asset dimensions. Deformation-bound Mesh2D must first be baked into static
  geometry. It supports
  one generation, 2–100 convex fragments and static rectangle environment
  bodies. Solid fragments are paths; image fragments are bake-owned Mesh2D
  layers with full-source normalized UVs and the source
  `fill`/`contain`/`cover`/`none` fit semantics. Mesh2D fragments preserve
  source triangle UV interpolation and appearance metadata.
- Fracture sources must be fully opaque. Enabled effects, masks and motion blur
  are rejected before Preview instead of being silently discarded.
- Artistic explosion stores a source-local centre, a composition-space
  direction, radial/directional velocity, spin, bounded variation and an
  unsigned seed. It is applied once as fragments activate and the editor
  discloses it as added external energy.
- Concave/donut roots, bonded compound-body runtime, Canvas bond selection,
  per-bond Group/Split/Unbreakable policy, fixed-tick forced breaks and damage
  resets are supported. FRACTURE3 supports one precomputed convex child
  generation selected by root fragment index. The child event must be later
  than the timed root event; impact roots and bonded root clusters are rejected
  in this first recursive slice. Default admission is depth 3, 16 generations,
  256 fragments, 4096 triangles and 8 MiB portable topology, with lower
  per-request limits allowed.

## Lifecycle and ownership

Boundary compilation is stateless and allocates temporary topology only for
the call. The returned polygon, bounds and centroid are plain immutable source
data; no DOM, GPU or Matter handle is retained. Bake preparation owns its
runtime resources until commit, cancel or discard. Only the realized source
polygon, fragment manifest, recipe provenance and generated tracks enter the
portable scene. Dense poses and solver objects remain job-owned runtime data.

## Editor-only Canvas diagnostics

`FractureOverlayGeometryResolver` is the geometry boundary for the Physics
panel's **Show on Canvas** diagnostics. It consumes the source scene, current
timeline time, evaluated transform overrides and one owned fracture bake
record. Before the fracture event it resolves the source transform; at and
after the event it resolves the generated fragment transforms. All returned
polygons and points are in composition/world pixels.

The resolver reuses `createLayerWorldMatrixResolver` instead of duplicating
parent-transform evaluation. It returns fragment cells, current straight-path
or fracture-Mesh2D render boundaries, actual compiled dynamic/static colliders,
fragment centroids and a diagnostic convex triangle fan. Convex collider
vertices are converted from centre-relative composition pixels back through
the current layer matrix without applying the authored uniform scale twice.
That fan is only a topology inspection aid: image
fragments have their own validated Mesh2D topology and UV layout, and neither
renderer nor exporter consumes the diagnostic fan.

`FractureRenderColliderAnalyzer` compares the current visible boundaries with
the active compiled colliders in the same evaluated frame. Its symmetric
vertex-to-edge distance supports different boundary tessellations, reports
maximum/mean composition-pixel delta and emits at most 64 editor-only connector
lines. `analyzeCommittedEvent` uses the canonical frame evaluator at the exact
atomic source→fragment tick. Unsupported curved/legacy appearance returns an
explicit unavailable result rather than a guessed alignment. The Inspector and
MCP `inspect_physics_bake` response consume this one domain report.

Diagnostics are derived view state. They are not written to scene JSON,
history, portable files or exporter payloads. Missing or legacy ownership data
returns no overlay instead of guessing an approximate association. `SceneCanvas`
hides the overlay while playback is running, and the raster/runtime/export
render boundaries never consume it. This keeps editor diagnostics from leaking
into preview or final output.

## Minimal use

```ts
const boundary = new FractureSourceBoundaryCompiler().compile(scene, sourceLayer)
const generation = new VoronoiFractureGenerator().generate({
  generationId: 'panel-generation-v1',
  sourceOwnerId: 'panel',
  sourcePolygon: boundary.polygon,
  fragmentCount: 16,
  seed: 42,
})

const recipe = new FractureRigidRecipeCompiler().compile(scene, {
  generation,
  timelineId: 'main',
  startTimeMs: 0,
  durationMs: 3000,
  fractureTimeMs: 1000,
  sourceBody,
  staticBodies: [floorBody],
})
```

For contact-driven fracture, omit `fractureTimeMs` and provide an explicit
trigger. Optional explosion values are velocities because the resolver adds
one activation delta rather than integrating an ongoing force:

```ts
const impactRecipe = new FractureRigidRecipeCompiler().compile(scene, {
  generation,
  timelineId: 'main',
  startTimeMs: 0,
  durationMs: 3000,
  fractureTrigger: {
    kind: 'impact',
    minimumRelativeNormalSpeedPxPerSecond: 120,
    colliderLayerIds: ['floor'],
  },
  explosion: {
    centerLocalOffsetPx: { x: 0, y: 0 },
    radialVelocityPxPerSecond: 180,
    directionDeg: -90,
    directionalVelocityPxPerSecond: 20,
    spinVelocityDegPerSecond: 180,
    variation: 0.15,
    seed: 20261121,
  },
  sourceBody,
  staticBodies: [floorBody],
})
```

Prepare `recipe` through `RigidBodyBakeAdapter`, preview the returned clip, and
publish only through `makeApplyVoronoiFractureBakeCmd`. Release discarded bake
previews so their managed resource reservation is returned.
