# Mesh modeling modifiers

`Smooth` and `Subdivision` are registered Mesh modifiers. Each class owns its
settings, defaults and validation. `ModifierStack.execute` runs them in list
order from the retained original source; settings remain UI drafts until
Execute. Geometry, bounds, picking, stroke rings, portable JSON, clone/instance
and flattened runtime use the same final validated result.

## Algorithms

Subdivision has independent strategies behind `MeshSubdivisionStrategy`:

- **Delaunay** (default): constrained Delaunay triangulation using pinned
  `cdt2d@1.0.0` (MIT). Original vertices and sampled boundary edges are retained;
  interior sites use a triangular lattice. Exterior, hole and island edges form
  a validated PSLG. The backend enforces constraints and removes exterior faces
  by crossing parity. This is not an unconstrained convex hull with centroid
  filtering, nor midpoint 1→4 refinement. D3's existing unconstrained/Voronoi
  workflow cannot supply these boundary constraints, so this is a separate
  explicitly constrained backend. [Backend contract](https://github.com/mikolalysenko/cdt2d#api).
- **Grid / Karelaj**: a source-local square lattice, clipped with the existing
  `polygon-clipping` intersection backend. Full squares are explicit
  `Mesh2DTopology.quadIndices` cells with matching renderer triangles. Clipped
  boundary cells retain holes/concavity and use constrained transition faces.
  Shared grid-edge cuts are inserted on both sides to avoid T-junctions.
  **Show mesh topology** hides only full quads' renderer-only diagonals; material
  drawing remains on the existing triangle backend. Partial boundary cells are
  intentionally not advertised as complete squares.

`levels` is an integer 0–4. `cellSizePx` is the base local-pixel cell/site size
(1–10000, default 40). Effective spacing is `cellSizePx / 2^levels`: smaller
spacing increases detail. Level zero is an admitted identity. These are remeshing
strategies; exact counts depend on the source boundary and retained sites.

Smooth uses uniform relaxed Laplacian/Jacobi updates. Interior vertices use all
topological neighbors; moving boundary vertices use only their two boundary
neighbors, independently of triangulation diagonals. `strength`/Amount is 0–1,
`iterations` is an integer 1–50, `preserveBoundary`/Keep boundary locks exterior
and hole vertices. Defaults .25 / 1 / false produce conservative outline motion.
Zero strength is identity. Boundary motion can shrink shapes; this is not an
area-preserving or Loop-subdivision smoother. [Uniform-weighting reference](https://www.graphics.rwth-aachen.de/media/openmesh_static/Documentations/OpenMesh-8.1-Documentation/a00656_source.html).

Every Smooth iteration rejects inverted/degenerate triangles at the existing
1e-8 local-px² signed-double-area threshold. Moving boundaries additionally use
the shared robust planar predicates to reject crossings, contact and changed
hole/island containment. Smooth can follow either Subdivision strategy; moving
it before Subdivision genuinely changes the latter's input region.

## Ownership, precision and compatibility

The geometry solvers contain no React, Layer commands, clocks, media or GPU
handles. `MeshModifier` adapts them to the general base: rejects bound clips,
pins and bake-owned fracture geometry, and rebuilds final boundary stroke rings.
Geometry modifiers must precede Deformation Clip; changed connectivity/rest
positions require explicitly rebinding a clip. Existing attachment guards remain.

Changed output has `source: { kind: 'authored', schemaVersion: 1 }`. Its actual
geometry is authoritative; the original generator lives in the stack source.
Bake/runtime retain an ordinary authored snapshot, never a false structured-grid
or external-Spline regeneration recipe. External regeneration reports this
capability limit explicitly. Appearance, transforms, lifetime and texture assets
keep existing ownership.

Remeshing uses the source piecewise-linear UV field. Affine UV mappings are
preserved exactly (within float tolerance). Other continuous UV fields are
resampled at new vertices and interpolated across the new faces; explicit
coincident-position UV seams refuse instead of being welded silently. Smooth
keeps UVs and rest texture reference bounds. Stable original IDs survive where
positions remain; new IDs use deterministic modifier-local namespaces.

Shared ring extraction, topology validation, adjacency, topology hashing and
robust planar predicates are reused. Quad metadata is an optional compatible v1
extension: legacy triangle-only hashes do not change; present quad cells enter
the hash and must match their positively ordered renderer triangles. No second
renderer or mutable runtime objects enter source JSON.

Only Mesh preparation rounds coordinates to 14 significant digits, matching
existing conversion precision. Local coordinates are bounded to ±10M px.
Material area must remain within max(1e-6 px², original area × 1e-8). Geometry
failures refuse the whole command; no partial result or silent fallback publishes.

## Budgets and lifecycle

Jobs own temporary arrays/indexes only. Smooth admits at most 8M neighbor visits;
base mesh modeling admits 262144 vertices, 524288 triangles and 4096 boundary
vertices. Boundary-motion checks admit 2048 boundary vertices. Remeshing admits
8192 source vertices / 2048 boundary vertices, 16384 output vertices / 32768
triangles. Delaunay admits 8192 lattice candidates / 4096 sampled boundary edges;
Grid admits 4096 cells and a 2M cell×boundary workload. UV indexing/query budgets
also fail explicitly. These synchronous limits avoid unbounded main-thread work.
The existing 16MiB/eight-entry weak-source result cache includes quad buffers.

## Usage and validation

```ts
const added = prepareAddModifier(scene, meshId, 'meshSubdivision')
const withModifier = added.command.execute(scene)
const command = makeExecuteModifierStackCmd(withModifier, meshId, {
  [added.modifierId]: { algorithm: 'grid', levels: 2, cellSizePx: 40 },
})
const result = command.execute(withModifier) // one complete result, one Undo
```

Those commands are exported from `src/lib/editor/modifiers/commands.ts`.
The pure geometry public entry points are `MeshSubdivision`,
`MeshSubdivisionStrategy` and `LaplacianMeshSmoother` under `geometry/mesh2d`.
Tests check Delaunay's local empty-circle criterion, actual square cells,
conforming curved holes/islands/concavity, UVs, area, deterministic IDs, order,
non-cumulative settings, disabled/removal/Undo, attachment failures and portable
load/clone/instance/Bake/runtime. Native acceptance reuses production Canvas/Edit
through `scripts/perf/geometry-conversion.mjs`; its header includes face/quad
counts and the View menu exposes topology.
