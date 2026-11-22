# Geometry Edit dock

Register `geometryEdit` as **Edit** in the dock registry. Use the same editor
callbacks as the former Spline Modeling dock, with `onLayerChange` for Mesh2D
settings and `splineSourceSettings` for the selected spline point inspector.

```tsx
<GeometryEditPanel
  layer={selectedLayer}
  selectedIds={Array.from(selectedLayerIds)}
  conversionDisabled={isPlaying || manualPreview || !!detail.session}
  selectedPointId={splinePointId}
  getScene={editor.getScene}
  getRevision={editor.getRevision}
  getDocumentSignal={editor.getDocumentSignal}
  isTransactionActive={editor.isTransactionActive}
  dispatchCommand={dispatchCommand}
  onSelectLayer={selectLayer}
  onClearPoint={() => setSplinePointId(null)}
  onLayerChange={updateLayer}
  splineSourceSettings={pointInspector}
/>
```

The page owns the shared spline controller and worker previews. Supply
`splineModeControls` with `SplineModeControls`, and `splineSourceSettings` with
`SplineEditInspector modeControls={false} modifierControls={false}`. The dock
keeps mode toggles first, the **+ Add modifiers** picker second, and contextual
selection properties below. The numeric provider remains around the whole dock.

Spline choices are Offset, Outline, Chamfer and Fillet. Mesh exposes its supported
Deformation Clip modifier separately; Geometry, Texture and Pins remain settings.
`activeSplineModifier`, `onSplineModifierSelect` and `splineModifierSettings` let
the page host existing worker-backed controls without a second preview owner.
The native picker opens draft settings; Apply retains each operation's current
source/Undo contract. It does not claim a new general live procedural stack.
Closing settings cancels the owning preview; context-started previews select the
same modifier row. Standalone callers retain the SplineModelingPanel fallback.

There is no Convert action or duplicate Source tab in this dock. Basic Shapes
point users to Properties; representation conversion stays in viewport right-click.
Saved representation steps are under **Conversion history**, with an accessible
apply checkmark and removal trash icon in the relevant row. Only the final stage
can be removed; dependency tooltips explain why Spline removal is disabled while
Mesh still consumes it. Source rebuild and topology invalidation policies remain
in `commands-geometry-conversion.ts`.

The page hosts this panel in `SplineToolsPanel contained`. Boolean preview and
line drawing retain their original owners. The old `splineTools`/`splineModeling`
dock IDs migrate to `geometryEdit`.

Clicking Point/Edge/Object enters that level; clicking the pressed mode exits.
Viewport editing replaces layer frames/gizmos with a light orange local boundary,
red selected sub-elements and a named edit badge. Leaving the mode restores normal
layer tools. Changing level/tool/pan cancels in-flight geometry gestures. Native
Delete uses the same mode-aware topology owner as Selection actions.

See [geometry conversion](../../../docs/tr/geometry-conversion.md) and
[Spline editing](../../../docs/tr/spline-subobject-editing.md) for source contracts,
serialization, coordinate units and standalone browser acceptance commands.
