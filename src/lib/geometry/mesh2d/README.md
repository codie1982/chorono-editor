# Mesh2D geometry core

This directory owns dimension-specific 2D topology generation and validation.
It does not own React controls, scene commands, rendering resources, cloth
constraints or simulation state.

## Public entry points

- `StructuredGridMesh2DGenerator` creates the deterministic MESH0 rectangle/grid
  topology, positions and normalized UVs.
- `Mesh2DTopologyValidator` validates serialized or generated geometry without
  repairing it silently.
- `Mesh2DAdjacencyBuilder` derives edge, vertex and triangle relationships for
  later selection and solver adapters.
- `Mesh2DTopologyHasher` identifies connectivity changes. It is a stale/cache
  change detector, not a cryptographic integrity primitive.

The package is exported through `src/lib/geometry/index.ts`. Serializable
records live in `src/lib/types/mesh2d.ts` and are re-exported by the types
barrel.

## Data flow and ownership

```text
structured-grid settings
        ↓
StructuredGridMesh2DGenerator
        ↓
JSON-compatible Mesh2DData
        ├── Mesh2DTopologyValidator
        ├── Mesh2DAdjacencyBuilder (derived, not persisted)
        └── future scene/render/solver adapters
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

## Minimal usage

```ts
import { StructuredGridMesh2DGenerator } from '@/lib/geometry'

const mesh = new StructuredGridMesh2DGenerator().generate({
  width: 320,
  height: 180,
  columns: 8,
  rows: 4,
})
```

The next integration step must add a complete layer path—schema/default,
command, selection/bounds, renderer and portable round-trip—rather than only a
registry entry. Spline/shape flattening and triangulation belong to MESH1 and
must reuse the validator instead of changing MESH0 semantics silently.
