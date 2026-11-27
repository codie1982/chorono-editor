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
| `topology` | `selection:{mode,ids}`, `action:{kind,...}`. Delete/Copy/Connect/Weld/Refine/Divide/Close/Open/Reverse obey native mode constraints. Point also supports `break`, `fuse`, `resetTangents`, `pasteTangents`; Edge supports `split`, `addVertex`, `trim`, `extend`; Object supports `simplify`, `smooth`, `subdivide`, `interpolation`. Divide uses 2–64 equal-parameter pieces. |
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

Point `break` opens a closed contour or cuts an interior anchor into independent
same-position endpoints; existing open endpoints refuse. `fuse` moves at least
two points/attached handles to their centroid without merging connectivity.
`resetTangents` rebuilds handles from neighboring anchors according to point type.
`pasteTangents` requires `tangents:{type,in?:{x,y},out?:{x,y}}`: vectors are local
offsets from each target anchor, not absolute positions. It never moves anchors.
UI Copy Tangents has no source or Undo effect; headless calls provide the payload
explicitly. Edge `split` accepts optional `t` (default .5, strictly between 0 and 1)
and `edgeId` within the selection; otherwise it cuts every selected edge. Exact
curve pieces retain shape and have independent endpoints. Each Apply is one Undo.

Edge `trim` and `extend` both require `{kind,edgeId,t}` with `0<=t<=1`; edgeId
must be in the explicit selection. Trim removes the contour interval containing
the pick between consecutive intersections, including multi-edge/seam intervals.
Open endpoints bound terminal intervals after at least one intersection. Extend
uses a terminal edge of an open contour; on a single-edge contour `t<.5` picks
the start, otherwise the end. It adds a straight terminal-tangent continuation
to the nearest strictly forward hit, preserving the existing curve. Targets
include the same spline and other visible spline layers at the requested frame,
respecting parent transforms, hidden ancestors and Solo. Shape/Mesh targets are
not included. No hit changes no source/Undo; overlaps and unresolved curved
tangencies refuse explicitly. Panel arming is UI-only and is never script state.

Edge `addVertex` requires `{kind:'addVertex',edgeId,t,pointType?}` with strictly
interior `0<t<1` and edgeId in the explicit selection. Omitted pointType or
`preserve` splits the exact curve, including quadratic/cubic handles. Other
values are `corner`, `smooth`, `bezier`, `bezierCorner`. Corner removes the new
handles; mirrored Bézier uses equal opposite handles (the shorter split length),
so those explicit choices can reshape the edge. Smooth/independent Bézier retain
the split geometry, promoting line/quadratic neighbors to cubic where needed.
Result includes `pointId` and two new Edge `ids`. The UI stays armed for repeated
clicks with separate Undo per insertion; Esc exits only the tool. Headless calls
insert once and never arm the mouse tool or write its transient preference.

Object `simplify` accepts optional `tolerancePx` (default .5, .001–1000), measured
in **layer-local px**, independently of composition scale. Bounded polynomial
coalescing compares each merge against original curve pieces, with a continuous
control-hull deviation bound. Surviving anchors, open endpoints, closed seam,
sharp turns ≥30°, independent-handle corners and contour/hole ownership remain.
It is conservative and can retain more points than a sampled polyline fit.
Object `smooth` needs no settings: recompute Smooth handles from neighbor anchors
without moving anchors or adding/subdividing them. Both require explicit Object
IDs, produce no modifier, and each changed Apply is one Undo. No-op results add
no Undo. Interactive budgets are 2,048 selected anchors / 64 contours / 4,096
before+after boundary samples; Simplify allows 500,000 control comparisons.
Ambiguous/crossing/changed-hole results refuse atomically. Sampling is only the
.01 local-px topology diagnostic, not Simplify's source-deviation guarantee.

Object `subdivide` accepts optional `parts` (integer 2–64, default 2), splitting
every owned edge, including hole contours, into equal-parameter pieces with the
existing exact Bézier splitter. Retained anchors and Object/contour IDs stay;
new segment IDs are prepared once. This is not arc-length resampling.

Object `interpolation` requires `tolerancePx` (.01–10 layer-local px or null).
It writes only `subShapes[id].interpolation:{version:1,tolerancePx}`; null removes
that preference and restores each consumer's old default. No source vertices,
handles or exact render curves change. Adaptive sampling uses this preference;
Mesh conversion uses the finer of Object/operation tolerance. Supplied Object
precision refuses unmet depth/sample budgets instead of silently clamping.
Explicit numerical solver tolerances keep their existing contracts. Source
selection/budgets/locks/geometry writers still use native guards. Each changed
Apply or reset is one Undo; identical settings add no Undo.

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
Coordinates are layer-local logical px; Offset/Chamfer/Fillet/Weld solver amounts
use composition px, while Object Simplify tolerance is local px. `timeMs`
evaluates parent placement; `timelineIds` is required for deterministic
edits in state-machine scenes. Inspect source drivers before modifying geometry.

The editor's Spline Boolean & Paths section integrates Union/Subtract/Intersect/
XOR, Compound Path, Merge Paths and Separate Paths. Default interactive area
actions materialize one editable spline in a single Undo. Non-Destructive keeps
the existing retained-input recipe until Merge; Merge collapses the parent itself
into a spline. `Separate Paths` groups independent outer contours with their
holes; `Separate Inputs` restores original Boolean sources. These UI choices do
not change the documented scripting `boolean` operation's retained-recipe contract.
Canvas shortcuts 1/2/3 enter Point/Edge/Object for selected Spline/Mesh; they do
not run in text/numeric inputs, modal widgets, timeline or 3D detail contexts.

Interactive spline Chamfer/Fillet/Offset Path are native Edit tools, not new
modifier instances. Point mode owns Chamfer/Fillet; Edge/Object owns Offset.
The native UI defaults to replacing the selected complete contours. Keep source
adds new Objects. In `prepare_spline_edit`, `kind:'offset'` accepts optional
`resultMode:'append'|'replace'`: omitted preserves the existing append/promotion
contract; replace requires complete contour edges and keeps original Object IDs,
unselected geometry, layer TRS and paint. Removed live geometry readers refuse.
Partial-chain Edit Offset and geometric Outline v2 are not available yet.
Existing serialized modifier records remain supported; no automatic load-time
bake occurs. Fill/Stroke stay in Properties.

The native Edit dock offers Spline/Mesh modifiers without entering Edit mode;
Point/Edge/Object tools require the separate source-edit session. Modifier
selection and pending drafts survive entering/leaving Edit. Add, Execute,
toggle, remove and Bake outside Edit do not start that session.
The dock has no Enter/Exit edit button; context menus and 1/2/3 enter Edit.
New UI modifier rows target all eligible stage input independently of the Edit
selection. Use selection/target lists explicitly stage a narrower scope; Execute
commits it. Explicit selection arguments in native command APIs keep their meaning.
The eight **Phase 1 static parametric spline modifiers** use
distinct recipe types: `offsetPath`, `roundCorners`, `pathSimplify`,
`pathSmoothing`, `pathResample`, `zigZag`, `puckerBloat`, `splineRepeater`.
They retain source and execute in stack order; numeric/scope
drafts apply only on Execute. Offset Path preserves Object identity; Simplify/
Smoothing accept stage-input `objectIds` and share the native edit algorithms.
Round Corners targets Corner/Bézier Corner types (not Smooth/linked Bézier) and
sets an absolute local-px radius, including already rounded circular runs between
straight sides. It does not use a 1px eligibility threshold or generator params.
Existing disabled rows stay Off until enabled. Curved-flank/elliptic/full-circle
rounding cannot be inferred; legacy Fillet keeps its existing behavior.
Path Resample emits a polyline with pinned corners/endpoints, max local spacing
and chord-error tolerance. Zig Zag is a static sharp polyline with alternating
normal amplitude and pinned span endpoints. Pucker & Bloat maps anchors/controls
radially with a signed amount about each Object or a Custom local center.
Repeater count is total instances, 1..32; linear/polar copies remain independent
Objects in the SAME spline and share layer paint. A full polar sweep has no
duplicated final instance. These are native registry choices; no new MCP
`spline.edit` discriminants or tool names are added.
Within an active Edit session, disabling/removing the last operation or Bake returns to Object edit;
Undo restores its exact recipe. Existing `offset`/`outline`/`chamfer`/`fillet`
records retain compatibility behavior. These are native registry choices, not
new `spline.edit(operation)` discriminators or new MCP tool names. Headless
source-edit operations above keep their existing contracts. Animated modifier
parameters and advanced path effects remain future work.

Native **Outline · Live** now retains the original source line and updates its
band automatically as source points/Bezier handles change. Apply creates or
updates a `liveOutline` recipe; it never replaces source vertices. Editable
source admission is limited to one terminal owner after a conversion-only
prefix; other generated stacks remain readonly. Object targets follow stable
Object IDs across Refine. Native Edge scope requires every contour of each
touched Object; partial-chain remapping is unavailable and explicitly disabled.

In Edit, **Show source line** is a UI-only guide toggle; **Outline enabled** is
a separate persisted recipe state. Only **Bake Outline / Stroke to Path** (or
Bake stack) materializes boundary vertices. Both source edits and Bake keep
native Undo/Redo. Appearance stays in Properties; band paint uses the source
Object ID and persists independently. Runtime/PNG/SVG consume the evaluated
band and never export the guide. Source/band width uses local px. Legacy
`strokeToPath`, `outline` and headless `prepareSplineBand` retain their meaning;
no auto-migration or centerline inference is performed. These are native
registry choices, not new MCP tool names or `spline.edit` kinds.
