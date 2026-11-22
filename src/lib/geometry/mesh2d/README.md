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
