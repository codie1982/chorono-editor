# Voronoi fracture foundation

This directory owns the first single-generation 2D destruction slice. It does
not own React controls, the Matter world, rendering, file I/O or recursive
cluster damage.

## Entry points and data flow

1. `VoronoiFractureGenerator.generate` validates a convex source polygon,
   realizes deterministic seeds with the compiler-owned PRNG, obtains cells
   from pinned `d3-delaunay@6.0.4`, clips them to the actual source, rejects
   slivers by retrying the whole generation and returns `FractureGeneration`.
2. `FractureManifestValidator.validate` verifies stored geometry, derived
   area/centroid/bounds and provenance without regenerating D3 cells. Saved
   polygons are authoritative across future library versions.
3. `FractureRigidRecipeCompiler.compile` reuses `RigidBodySceneCompiler` for
   the dynamic rectangle and static environment, then adds centroid-relative
   convex fragment colliders and one fixed-tick replacement event.
4. `RigidBodyBakeAdapter` runs the extended `MatterPhysicsBackend`. At the
   event tick the source body is removed, fragment bodies are added, and each
   receives source linear velocity plus the angular tangential component.
5. `makeApplyVoronoiFractureBakeCmd` creates editable path layers, normal
   transform/visibility tracks, topology persistence and ownership atomically.
   Undo restores the exact prior layer, timeline and physics envelopes.

## Contracts

- Geometry is source-layer local pixels with +Y down. Polygons have no repeated
  closing vertex, are strictly convex and use positive shoelace area.
- Simulation is composition pixels with +Y down and clockwise degrees. Recipe
  gravity remains metres/s² and uses an explicit pixels-per-metre conversion.
- Fracture time is local simulation milliseconds and must equal an interior
  integer fixed-step tick. Preview samples can use a lower FPS that divides the
  solver rate.
- Runtime Matter objects and dense pose samples never enter scene JSON. The
  project stores realized topology, recipe provenance and generated track
  ownership; normal tracks drive player/render/export without a solver.
- V1 supports a sharp, solid-fill root rectangle, one generation, 2–100 convex
  fragments and static rectangle environment bodies. Concave/donut sources,
  image UV fragments, impact triggers, explosion impulses, bonded clusters and
  recursive destruction are later stages.

## Minimal use

```ts
const generation = new VoronoiFractureGenerator().generate({
  generationId: 'panel-generation-v1',
  sourceOwnerId: 'panel',
  sourcePolygon: [
    { x: 0, y: 0 }, { x: 320, y: 0 },
    { x: 320, y: 180 }, { x: 0, y: 180 },
  ],
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

Prepare `recipe` through `RigidBodyBakeAdapter`, preview the returned clip, and
publish only through `makeApplyVoronoiFractureBakeCmd`. Release discarded bake
previews so their managed resource reservation is returned.
