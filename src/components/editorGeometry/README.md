# Geometry Edit dock

`geometryEdit` is the separate **Edit** dock. Basic Shapes point to Properties;
conversion stays in viewport right-click **Convert → Spline / 2D Mesh**. The dock
contains edit-mode controls and a single persistent ordered modifier stack.

```tsx
<GeometryEditPanel layer={selectedLayer} selectedIds={[selectedLayer.id]}
  selectedPointId={splineEdit.mode === 'point' ? splineEdit.ids[0] ?? null : null}
  selectedPointIds={splineEdit.bank.point}
  selectedContourIds={selectedContourIds}
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
provide category, supported input types and setting fields. Spline offers Offset,
Outline, Chamfer and Fillet; Mesh offers Smooth, Subdivision and Deformation Clip. Subdivision owns a
Delaunay-first algorithm selector, Grid/Karelaj, levels and base cell size. Smooth
owns amount, iterations and Keep boundary. Optional descriptor descriptions
explain each operation without panel-specific algorithm branches. New registered
strategies appear without panel switches. Repeated types are distinct instances.
Conversion steps occupy their actual positions in the same stack, not a separate
history. A non-addable conversion remains in the viewport menu.

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

`ModifierSettingsForm` renders class-owned schemas without geometry algorithms.
`ModifierSourceSettings` owns source-parameter drafts. `ModifierActionIcon` supplies
decorative SVGs; native buttons provide labels, keyboard focus and tooltips.
There are no TODO placeholders or obsolete bottom Apply/Remove-last buttons.

The page still owns native Point/Edge/Object selection and existing context-menu
worker previews; those are separate one-shot geometry tools. The optional
`splineToolPreview` slot shows their active Apply/Cancel controls above the stack. Edit-mode toggles
stay above the stack; the inspector appears below. Active mode replaces the layer
bbox with an orange boundary, red selected elements and a named viewport badge.
The page's `useGeometryEditMode` scopes Edit-panel visibility to one selection and
document. Outside Edit mode the panel keeps the selected name/type and an **Enter
edit mode** action; source controls, modifier settings and mesh tools mount only
inside the session. Mesh/generated-spline settings sessions have a viewport badge
and suppress layer gizmos; writable splines reuse the Point/Edge/Object controller.
Exit, mode-toggle exit, selection change and document replacement restore layer
tools without writing source/history. Normal geometry-driven frames use the shared
transform resize gesture, preserving source points, topology and modifier recipes.
During frame resize, the origin/selection-center marker follows the live preview
transform. The opposite-handle pivot used by resize math does not replace that
marker; fixed rotation/axis-scale tool pivots retain their existing behavior.
Changing mode/tool/pan cancels in-flight gestures. Native Delete uses the shared
mode-aware topology owner. A generated modifier result is never overwritten by
those direct source tools.

See the [modifier architecture](../../lib/modifiers/README.md),
[conversion contract](../../../docs/tr/geometry-conversion.md) and
[Spline editing](../../../docs/tr/spline-subobject-editing.md).
