# Geometry Edit dock

`geometryEdit` is the separate **Edit** dock. Basic Shapes point to Properties;
conversion stays in viewport right-click **Convert → Spline / 2D Mesh**. The dock
contains edit-mode controls and a single persistent ordered modifier stack.

```tsx
<GeometryEditPanel layer={selectedLayer} selectedIds={[selectedLayer.id]}
  selectedPointId={splineEdit.mode === 'point' ? splineEdit.ids[0] ?? null : null}
  selectedPointIds={splineEdit.bank.point}
  selectedContourIds={selectedContourIds}
  selectedObjectIds={splineEdit.mode === 'object' ? splineEdit.bank.object : []}
  getScene={editor.getScene} getRevision={editor.getRevision}
  getDocumentSignal={editor.getDocumentSignal}
  isTransactionActive={editor.isTransactionActive}
  dispatchCommand={dispatchCommand} onSelectLayer={selectLayer}
  onClearPoint={splineEdit.clear} onLayerChange={updateLayer}
  conversionDisabled={isPlaying || manualPreview || !!detail.session}
  splineModeControls={<SplineModeControls controller={splineEdit}
    disabled={modifierOutputReadOnly(selectedLayer)} />}
  splineSourceSettings={pointInspector}
/>
```

`ModifierStackPanel` owns only local selection/drafts/errors. Registry descriptors
provide category, supported input types and setting fields. Spline offers Offset
Path, Round Corners, Path Simplify, Path Smoothing, Path Resample, Zig Zag,
Pucker & Bloat and Repeater; compatibility Offset,
Outline, Chamfer and Fillet retain old records. Mesh offers Smooth, Subdivision and Deformation Clip. Subdivision owns a
Delaunay-first algorithm selector, Grid/Karelaj, levels and base cell size. Smooth
owns amount, iterations and Keep boundary. Optional descriptor descriptions
explain each operation without panel-specific algorithm branches. New registered
strategies appear without panel switches. Repeated types are distinct instances.
Conversion steps occupy their actual positions in the same stack, not a separate
history. A non-addable conversion remains in the viewport menu.
Round Corners targets Corner/Bézier Corner points and sets an absolute local-px
radius. It can resize baked circular corner runs between straight sides; Smooth
points are not implicit targets. Existing disabled records remain Off until the
user enables them. Unsupported curved-flank/elliptic runs are not guessed.
Resample explicitly emits a polyline with pinned endpoints/corners and bounded
curve error. Zig Zag exposes amplitude/peak spacing. Pucker & Bloat uses a signed
radial control-cage map with Object/custom center. Repeater exposes linear/polar
placement and copies Objects inside this spline with shared layer paint.
All target fields list the actual prefix input and all settings remain Execute
drafts. [Phase 1 contracts](../../../docs/tr/spline-phase1-modifiers.md).

Typing settings never writes geometry. **Execute stack** stages all row drafts
and dispatches one complete native command. The row's accessible checkmark
executes that row's settings through the same complete pipeline. Up/down,
enable and trash also use validated stack commands. Dependency errors appear
in a focusable alert; no partial Layer is committed. Record identity invalidates
stale drafts on Undo/Redo. Closing/changing selection discards UI drafts only.

Source shows captured geometry and explicit **Rebuild from source** controls.
Rebuild clears converted point overrides; **Bake stack** makes the validated
result ordinary editable geometry. Generated points are read-only while geometry
modifiers are enabled. Mode buttons are disabled accordingly; conversion-only
Splines remain directly editable. Mesh texture and pins retain existing owners.

New modifier rows default to their complete eligible prefix input. The transient
Point/Edge/Object selection is never adopted implicitly; **Use selection** is
an explicit target draft and still requires Execute. Native command callers may
continue to pass explicit selection IDs to `prepareAddModifier`.
Object target fields list the selected modifier's actual prefix input, even
while final generated geometry is read-only. Object IDs join point/contour
selection in the native command policy and topology signature. Modern stacks
are visible; legacy-only Spline stacks retain the closed Source / History
drawer. Within an active Edit session, disabling/removing the last geometry
operation or Bake restores Object mode. The panel remains available outside
Edit as well. [Static Spline contracts](../../../docs/tr/spline-static-modifiers.md).

`ModifierSettingsForm` renders class-owned schemas without geometry algorithms.
`ModifierSourceSettings` owns source-parameter drafts. `ModifierActionIcon` supplies
decorative SVGs; native buttons provide labels, keyboard focus and tooltips.
There are no TODO placeholders or obsolete bottom Apply/Remove-last buttons.

The page still owns native Point/Edge/Object selection and existing context-menu
worker previews; those are separate one-shot geometry tools. The optional
`splineToolPreview` slot shows their active Apply/Cancel controls above the stack. Edit-mode toggles
stay above the stack; the inspector appears below. Active mode replaces the layer
bbox with an orange boundary, red selected elements and a named viewport badge.
The page's `useGeometryEditMode` scopes native source tools to one selection and
document. Outside Edit mode the panel keeps the selected name/type and the
modifier stack, picker and settings for Spline/Mesh. There is no Enter/Exit edit
mode button in the dock; viewport/list context menus and 1/2/3 enter the session,
and Escape or the active Spline mode toggle/Done leaves it.
Point/Edge/Object controls, native inspectors and mesh source/texture/pin tools
mount only inside the session. Enter/exit retains modifier selection and drafts;
Add, Execute, toggle, remove and Bake outside Edit never start it. Bake restores
Object focus only if Edit was already active. Mesh/generated-spline sessions have a viewport badge
and suppress layer gizmos; writable splines reuse the Point/Edge/Object controller.
Exit, mode-toggle exit, selection change and document replacement restore layer
tools without writing source/history. Normal geometry-driven frames use the shared
transform resize gesture, preserving source points, topology and modifier recipes.
During frame resize, the origin/selection-center marker follows the live preview
transform. The opposite-handle pivot used by resize math does not replace that
marker; fixed rotation/axis-scale tool pivots retain their existing behavior.
Inside Edit mode, whole-mesh drags use the native pointer transaction with a
`meshGeometry` adapter and one persisted **Edit Mesh** stage.
`useMeshEditSession` retains the same instance across tools, gestures and Undo;
each movement composes its local affine into that stage in a separate Undo step.
The entry ghost does not reset after Execute, Undo/Redo or a playhead change;
temporary preview/playback hiding keeps its snapshot until the session exits.
Re-entering Edit reuses the existing enabled tail Edit Mesh instance and captures
the current evaluated geometry as a new ghost baseline. Enter/exit adds no Undo
step; the next movement has its own Undo/Redo and leaves that new ghost unchanged.
Spline sub-object gestures keep their existing source-point commands. Both preserve object TRS and
anchor; mesh arrow nudges use local geometry commands as well. Generated Spline
results never fall through to root transforms. `GeometryEditGhost` retains one
boundary string, world matrix and origin from entry, releases on exit, and draws
only viewport chrome. Mesh live boundaries are orange, the initial silhouette is
dashed/translucent, and the original origin remains visible.
Spline Fill/Stroke controls belong only to Properties; the Edit inspector has
no Appearance section. New open/closed spline defaults are stroke-only, while
Properties can explicitly enable Color/Gradient/Image Fill. Existing paint is
preserved on load and imported/derived callers may supply explicit appearance.
**Add Spline** uses an accessible `+` toggle to pick existing scene splines in
the viewport or Scene Explorer. The shared selection controller owns this
transient, layer/document scoped mode; `useSplineAttachPicking` routes both
surfaces through shared native Attach or Boolean commands.
`useSplineViewportEditing` consumes canvas picks before regions/transforms;
Scene Explorer's optional `onPickLayer` consumes click/Enter/Space before its
normal single/range/additive selection, so the active target stays selected.
With picking off, the existing list selection contract is unchanged. Each successful
pick is one Undo/Redo. Attach consumes the source into the target's geometry;
Boolean retains original layers under its recipe group and derives A's paint.
Both preserve world geometry/contours. Static/unreferenced-source guards
remain authoritative; rejected or empty picks preserve the target and history.
Consecutive picks stay armed; `+`, Escape, right-click, mode exit, selection or
document replacement end picking. New drawing is a separate **Draw new spline
elements** section; the host leaves its drawing tool before enabling Attach.
For the isolated native acceptance, stop Next and run
`node scripts/perf/spline-topology.mjs /tmp/spline-attach-qa attach`, serve that
directory with `scripts/perf/serve.mjs`, open `spline-attach.html` and run its
checks. It verifies consecutive and mixed viewport/Explorer picks, Shift/Cmd
and keyboard activation, holes, transformed parents, target paint, individual
history, empty/invalid picks, cancellation and restored normal list selection
through production UI. Explorer failures use the host's existing warning surface
(the page uses a toast) and preserve the target rather than falling through.
The operation toggle buttons default to Union and also offer Subtract, Intersect
and XOR. Clicking applies the current Object bank immediately (first selected
Object is A); fewer than two Objects only changes the next-pick preference.
+ enables picks of other Objects in this compound spline or whole splines/shapes
from the viewport/Scene Explorer, extending the same recipe. Unselected Objects
remain visible and original sources remain retained. All routes use the
existing persisted Boolean plan/backend rather than a second
clipping algorithm. `useSplineAttachPicking` routes these to
`editor/boolean/pickOperation.ts`; the old transfer action remains explicitly
available as Attach for open/closed contours. The shared operation action hook
serves both Add Spline and Boolean Preview: Merge Paths materializes just that
recipe to editable, tolerance-sampled line segments; Separate Inputs restores
original components. Exact original Bézier controls remain in retained inputs
until Merge (and in its Undo). Same-parent/stacking/static-source guards remain.
Line drawing uses `SplineLineDraft` as its private placed-anchor owner in
composition pixels. Explicit return to the start/opposite endpoint closes at
the shared 10 CSS px tolerance when Auto Close is enabled (the default). A snapped
anchor in the edited spline finishes the path while Auto Close is on: open endpoints reuse native Join,
closed circle/curve anchors are positional and preserve their original Béziers.
With Auto Close off, returning to the start or snapping to another anchor keeps
drawing; Enter/Escape save placed anchors open and right-click follows Auto Close. Each
finish is one native command/Undo; one anchor creates no source. Backspace affects
only the current draft; stale/document/mode teardown and box cancellation never
overwrite source. `scripts/perf/spline-connections.mjs` exercises real context-menu
drawing, circle closure, both exit surfaces, existing arc joins, history and raster.
Changing mode/tool/pan cancels in-flight gestures. Native Delete uses the shared
mode-aware topology owner. A generated modifier result is never overwritten by
those direct source tools.

See the [modifier architecture](../../lib/modifiers/README.md),
[conversion contract](../../../docs/tr/geometry-conversion.md) and
[Spline editing](../../../docs/tr/spline-subobject-editing.md).

Spline Edit reuses MoveAxisGizmo at the selected Point/Edge/Object anchor center.
Axis arrows constrain the captured Scene/Local X/Y frame before the complete
world-to-local inverse; Shift uses the same frame and shared applyAxisLock math.
Geometry changes use the same native pointer transaction and keep Layer TRS/origin,
keys and the session ghost fixed. No transform frame is restored in Edit mode.
The modifier stack has a full frame and a bounded scroll region; selection reveal
scrolls only that region. Add modifiers sits beside the stack title; Execute
sits below the ordered list, above the selected settings. Both remain outside
the list's scroll region. Its focus
scope owns native keyboard input so scrolling/buttons cannot nudge scene geometry.
New spline paint is Fill None and solid black Stroke 3 px, with opt-in fill only
in Properties. Conversion supplies the same fallback when no visible authored
stroke exists; saved/user paint stays authoritative.

The main toolbox's **Axes · Scene / Local** selector belongs to `useToolMode`,
not scene JSON or Undo. It survives selection and tool changes, defaulting to
Scene on editor startup. `lib/canvas/math/transformAxes.ts` normalizes the active
root's evaluated world-matrix columns (parents, reflection and inherited shear
included). Scene uses identity. One captured frame drives both constant-size
Move/Scale arrow hit bands and native layer/Edit drag constraints; changing
space cancels a live gesture through the existing context guard. Multi-selection
uses the active root's common axes and the existing independent-root preparation;
children are not transformed twice. Edit gestures keep layer TRS/keys/ghost fixed.

Scale uses the same basis on each root through `scaleTransformTargets`; it
rejects world/local combinations that require unrepresentable TRS shear instead
of approximating geometry. Selection-frame resizing, numeric fields explicitly
labelled local, rotation rings and keyboard navigation keep their own documented
contracts. `scripts/perf/spline-edit.mjs` verifies both spaces under an animated,
nonuniform parent; `scripts/perf/spline-attach.mjs` verifies the Boolean buttons,
interior-edge removal, same-layer + picks, Explorer picks, Undo and raster output.

Native **Outline · Live** creates/updates a `liveOutline` recipe while retaining
source points. The all-mode Edit controls expose Outline enabled, Show source
line (UI-only) and explicit Bake Outline / Stroke to Path. Native Edge scope
requires all contours of each touched Object. The Outline modifier is available
outside Edit; other generated strategies keep readonly admission. Paint targets
use stable source Object IDs without tagging source geometry. See
[live contract](../../../docs/tr/spline-live-outline.md).
