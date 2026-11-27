# Mesh2D geometry core

This directory owns dimension-specific 2D topology generation and validation.
It does not own React controls, scene commands, rendering resources, cloth
constraints or simulation state.

## Public entry points

- `StructuredGridMesh2DGenerator` creates the deterministic MESH0 rectangle/grid
  topology, positions and normalized UVs.
- `SplineBoundaryMesh2DGenerator` implements the first MESH1 source adapter. It
  flattens closed spline contours at a recorded local-pixel tolerance, validates
  ring topology, classifies holes and triangulates them through Earcut 3.2.4.
- `ShapeBoundaryMesh2DGenerator` adapts supported closed parametric shapes
  through `ShapeToPathConverter` and the same spline boundary validator. Open
  stroke primitives are rejected; a full ring remains an outer contour plus a
  real hole.
- `SplineBoundaryRingBuilder` owns contour admission, intersection checks and
  even-odd/nonzero fill-role classification. It does not triangulate or render.
- `Mesh2DTopologyValidator` validates serialized or generated geometry without
  repairing it silently.
- `Mesh2DAdjacencyBuilder` derives edge, vertex and triangle relationships for
  later selection and solver adapters.
- `Mesh2DTopologyHasher` identifies connectivity changes. It is a stale/cache
  change detector, not a cryptographic integrity primitive.
- `computeMesh2DLocalBounds` and `containsMesh2DPoint` provide renderer/editor
  queries without an AABB fallback that would hide holes.

The package is exported through `src/lib/geometry/index.ts`. Serializable
records live in `src/lib/types/mesh2d.ts` and are re-exported by the types
barrel.

## Data flow and ownership

```text
structured-grid settings ──→ StructuredGridMesh2DGenerator ──┐
                                                             │
closed spline + tolerance ─→ SplineBoundaryRingBuilder       ├─→ Mesh2DData
                                      ↓                      │
                         SplineBoundaryMesh2DGenerator ───────┘
                                     ↑
closed shape → ShapeToPathConverter → ShapeBoundary adapter
                                                             ↓
        ├── Mesh2DTopologyValidator
        ├── Mesh2DAdjacencyBuilder (derived, not persisted)
        ├── Mesh2D layer definition + atomic property regeneration
        ├── Canvas2D renderer / bounds / triangle hit testing
        └── future solver adapters
```

Source arrays use ordinary numbers so portable JSON, clone and undo do not
retain browser/GPU handles. A renderer or solver may compile them into bounded
typed buffers and owns releasing those buffers. Dense deformation samples and
cloth rest/constraint state do not belong in `Mesh2DData`.

## Coordinates and determinism

- Positions use layer-local composition pixels: x points right and y points
  down.
- Positive signed triangle area is the supported front winding.
- UVs span `[0, 1]²` from top-left to bottom-right.
- Rows and columns are cell counts; vertex dimensions add one on each axis.
- The same cell counts and diagonal policy produce the same stable vertex ids,
  triangle ordering and topology hash. Width/height changes move vertices but
  do not change connectivity or the topology hash.
- Requests above the generator's vertex budget fail before array allocation.
- Spline flatten tolerance is persisted in local pixels. Viewport zoom never
  changes derived positions, vertex count or topology.
- Spline contour/sample ids provide stable vertex ids. A separate source
  fingerprint includes flattened positions and settings, so moving an existing
  point can mark the derived mesh stale even when connectivity is unchanged.
- Intersecting/touching rings, self-intersections, open/zero-area boundaries,
  unsupported boolean combine modes and ambiguous nonzero nesting fail before
  Earcut. Earcut output is area-checked and passed through the shared validator;
  it is boundary triangulation, not a conforming or quality remesher.
- Shape-derived meshes use the renderer's authoritative parametric path
  conversion. Shape size, geometry parameters and corner radius affect the
  fingerprint; transforms and viewport zoom do not alter local topology.

## Minimal usage

```ts
import {
  SplineBoundaryMesh2DGenerator,
  ShapeBoundaryMesh2DGenerator,
  StructuredGridMesh2DGenerator,
} from '@/lib/geometry'

const mesh = new StructuredGridMesh2DGenerator().generate({
  width: 320,
  height: 180,
  columns: 8,
  rows: 4,
})

const splineMesh = new SplineBoundaryMesh2DGenerator().generate(
  sourceLayer.id,
  sourceLayer.spline,
  { flattenTolerance: 0.25 },
)

const shapeMesh = new ShapeBoundaryMesh2DGenerator().generate(
  shapeLayer.id,
  {
    kind: shapeLayer.shapeKind ?? shapeLayer.shape ?? 'rect',
    size: shapeLayer.size,
    params: shapeLayer.shapeParams,
    cornerRadius: shapeLayer.style?.cornerRadius,
  },
)
```

Users create the same source through **Add Layer → Mesh & Surface → Structured
Grid**. Its Geometry inspector changes call the registered derived-data edit
strategy, which validates and regenerates source plus geometry as one immutable
layer snapshot. That snapshot is one ordinary editor update/undo operation.
The Canvas2D plugin renders content in editor, preview and export. The
viewport's **View → Show mesh topology** option draws the selected mesh
wireframe as editor-only chrome. It is off by default, is not serialized, and
never appears in preview or export. Save/load, copy and live instances use the
ordinary Layer JSON contracts and keep runtime/GPU buffers out of source data.

For a selected spline or supported closed parametric shape, the corresponding
**Create Mesh2D from closed …** action creates a new layer and preserves the
source. The Mesh2D inspector reports missing/changed/current source state.
Regeneration and tolerance edits replace the full validated geometry in one
undoable layer update. The persisted fingerprint is the stale signal that
later topology-bound pin/cache/bake consumers must include.

This slice deliberately does not expose vertex/edge/face editing and does not
share a 3D modeling object. It supports boundary triangulation for closed
spline/shape sources, not quality remeshing or interior refinement. Cloth rest
data and variable-topology Blob/fluid surfaces remain separate later
subsystems.


## Smooth and Subdivision

The modeling solvers and strategy contract are exported from this module.
Subdivision defaults to constrained Delaunay and separately supports square
Grid/Karelaj cells. Optional quad-cell topology has matching renderer triangles;
legacy triangle-only hashes remain unchanged. Modified/baked output uses an
authored geometry source instead of a misleading generator recipe.
See [algorithms, UV behavior, source contracts and budgets](modeling/README.md).

## Component editing and technical reference — 24 November 2026

Before changing Mesh topology, selection, attributes, modifiers or simulation,
read the [technical reference and repository adaptations](../../../../docs/tr/mesh2d-topology-reference.md)
and the relevant section of its archived PDF. The [mode/tool plan](../../../../docs/tr/plans/mesh2d-edit-modes-plan.md)
separates delivered functionality from requested future operators.

`Mesh2DTopology` owns stable vertex IDs, renderer triangles, optional logical
quad cells and their topology hash. Positions and UVs belong to
`Mesh2DGeometry`; scene placement, renderer resources and solver state are
separate. Existing files use local x-right/y-down coordinates and positive
signed triangle area. No load-time coordinate conversion is performed.

Entry points:

- `StructuredGridMesh2DGenerator`: new grids include explicit four-sided cells
  backed by two triangles in either diagonal direction. Existing serialized
  triangle-only v1 topology remains valid.
- `Mesh2DAdjacencyBuilder` / `Mesh2DTopologyValidator`: canonical triangle
  connectivity and geometric validation; do not fork their invariants per tool.
- `selection/MeshFaceTopology`: logical face view, hides quad diagonals from
  editing, preserves independent transition triangles. Matching legacy Grid
  recipes can supply cell structure without mutating source records.
- `selection/MeshComponentSelection`: world-space Vertex/Edge/Face picking,
  region membership, stable selected IDs and deduplicated vertex targets.
- `selection/MeshFaceGeometryConverter`: explicit Bake materialization of old
  Grid cells. It preserves positions/UV/triangles while hashing cell metadata;
  its caller must reject incompatible pin/clip ownership.
- `edit/topologyEdit`: applies Delete Face, Split Edge, Flip Edge and Fill to
  local triangle/quad geometry. The stable input hash guards the selection.
  Split interpolates the new vertex position and UV at the same edge parameter.
  `edit/topologyChanges` maps each affected logical ID to its replacements.
- `modeling`: shared Smooth, remeshing, UV transfer and bounded Delaunay/Grid
  strategies; [numerical contracts](modeling/README.md).

The general modifier runner is `src/lib/modifiers`; native mutations use
`src/lib/editor/modifiers/commands.ts`. UI sessions and overlays live under
`src/components/canvas/mesh2d`, panel controls under `editorGeometry`.
Selection, ghost and current mode are transient; one Edit Mesh stage retains
source geometry edits with a separate native Undo per gesture.

Example: 4 columns × 3 rows produce 20 vertices, 31 logical edges and 12 quad
faces, rendered by 24 triangles. Face transforms use the union of selected
face vertices; shared points move once and outer layer transforms stay fixed.
The independently prepared browser acceptance is
`node scripts/perf/mesh-face-edit.mjs /tmp/chorono-mesh-face-qa` (stop Next first).

General half-edge/n-gon authoring, per-corner UV/seams, arbitrary topology remapping, targeted
modifier scopes, skinning and XPBD are planned extensions. Their appearance in
the reference PDF is not evidence of a shipped implementation. Preserve source,
output units, lifetime, rollback and failure contracts when adding them.

A native call such as `makeMeshTopologyCmd(scene, layer.id, editId, {
kind: 'splitEdge', topologyHash, ids: [edge.id], t: 0.25, vertexId: newId
})` prepares one validated command. Dispatch it through the editor. Its
`changes.replacements.edges.get(edge.id)` contains both child IDs. Splitting a
shared quad edge produces one quad and one triangle per incident quad. The
tail Edit Mesh stage replays its ordered topology steps before pending vertex
offsets. Previously saved affine-only stages keep their original evaluation.
