# Native spline editing

Discover `get_capabilities({toolName:'prepare_spline_edit'})`. Its operation
schema is authoritative, including each mode's valid actions/limits. Read the
complete source from `get_scene` before preparing; selection uses stable source
IDs, never remembered panel indices or names.

1. Prepare using that read's `revision`/`readToken`, `layerId` and one operation.
2. Inspect the returned draft PNG and `changeSummary`. Source/history/playback
   are unchanged. `previewWidth:0` explicitly skips pixels; it cannot establish
   visual quality. Default width is min(640, composition width).
3. Apply with `planId`, returned revision and **NEW plan-bound readToken**. Do
   not read again and substitute an ordinary token into this prepared Apply.
   Generated IDs are reused; the solver does not rerun. Apply is one Undo.
4. Or call `discard_spline_edit({planId})` in the same client/editor. It needs
   no source token, releases the draft/token, and changes no source/history.

These three lifecycle tools cannot be nested in `batch_actions`. Plans expire
after five minutes, require unchanged source/document/client, and share a
50-plan/64 MiB estimated source budget with script plans. Discard unused drafts.
An uncertain transport retry reuses exact arguments and a stable requestId.
After conflict, read current source and prepare again rather than force Apply.

| Operation kind | Address / meaning |
| --- | --- |
| `topology` | `selection:{mode,ids}`, `action:{kind,...}`. Delete/Copy/Connect/Weld/Refine/Divide/Close/Open/Reverse obey native mode constraints. Divide uses 2–64 equal-parameter pieces. |
| `append` | Native primitive plus matching params; adds a SubShape to the same spline. |
| `draw` | NEW local `points`, optional existing `startPointId` and `endPointId`; Continue/Join references the actual open endpoints. Auto Close closes ≥3 anchors. |
| `transform` | Explicit selection and local x/y, clockwise rotation delta, positive scale factors around anchor-bounds center. |
| `movePoint`, `pointType`, `edgeType` | Existing point/segment IDs; no UI selection write. |
| `paint` | Complete `fill` and/or `stroke`; omitted sibling remains. Fill solid/gradient/image/none, stroke solid/gradient/none. Paint opacity is 0–100; layer opacity 0–1. |
| `attach`, `detach` | Source spline ID / whole SubShape IDs. Attach consumes only safe static unreferenced sources; target paint wins. Detach preserves supported outer animation. |
| `offset` | Object/Edge selection, distance, side, join, miter limit and tolerance in composition px. New editable Object(s); source retained. |
| `chamfer` | Selected point IDs, distancePx along adjacent edges; ≤128 points. |
| `fillet` | Selected point IDs, radiusPx; ≤64 points. Ambiguous/intersecting solutions refuse. |
| `boolean` | Ordered 2–8 closed Shape/Spline targets, or existing recipe `ownerId` to re-edit. Union/Subtract/Intersect/XOR, reverse and tolerance. `layerId` may be omitted. |

Boolean `operation` values are `union`, `subtract`, `intersect`, `xor`. These
retain original inputs in a recipe group. The editor's Add Spline picker shares
this solver/recipe with preview; Attach is a separate contour transfer mode.
UI **Merge Paths** materializes editable tolerance-sampled line segments; it
does not recover exact original Bézier handles. **Separate Inputs** restores
retained components. Those two UI/native commands are not new `spline_edit`
operation kinds; do not imitate them by deleting protected children.

Boolean Apply retains original inputs in a normal owned group and produces a
generated spline child. Never replace/delete/reparent/copy a lone protected
input/result or key generated topology. Re-edit the owner with the same plan
workflow. `combineMode` alone is not a Boolean solver.

Simple synchronous procedural work can use `layer.spline.edit(operation)` with
all kinds above **except offset/chamfer/fillet/boolean**. It returns detached
result IDs. QuickJS/Console share strict input limits and native command guards.
Old SplineHandle methods remain; unsafe keyed/driven edits and referenced-ID
removals refuse instead of silently dropping animation tracks.

Headless drawing is explicit: supply endpoint IDs to represent vertex snapping;
there is no mouse cursor, snapping tolerance gesture or global preference write.
Coordinates are layer-local logical px; solver amounts/tolerance are composition
px. `timeMs` evaluates parent placement; `timelineIds` is required for deterministic
edits in state-machine scenes. Inspect source drivers before modifying geometry.
