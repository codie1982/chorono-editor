# Geometry Edit dock

Register `geometryEdit` as **Edit** in the dock registry. Use the same editor
callbacks as the former Spline Modeling dock, with `onLayerChange` for Mesh2D
settings and `splineSourceSettings` for the selected spline point inspector.

```tsx
<GeometryEditPanel
  layer={selectedLayer}
  selectedPointId={splinePointId}
  getScene={editor.getScene}
  getRevision={editor.getRevision}
  getDocumentSignal={editor.getDocumentSignal}
  isTransactionActive={editor.isTransactionActive}
  dispatchCommand={dispatchCommand}
  onSelectLayer={selectLayer}
  onClearPoint={() => setSplinePointId(null)}
  onLayerChange={updateLayer}
  onCreateMeshFromSpline={createMesh2DFromSpline}
  splineSourceSettings={pointInspector}
/>
```

The host wraps the Edit content in the existing numeric property provider so
mesh schema fields and the point inspector preserve formulas and timeline
context. Selecting a canvas spline point opens this dock. Source settings are
available for spline and Mesh2D layers. Basic
shapes keep their parametric controls in Properties. Spline fill, stroke,
and trim and Mesh2D fill also stay in Properties.

**Modeling operations** lists available spline tools. Each operation has its
own settings and a local preview. Switching layers or operations discards the
draft. Apply checks the source revision and dispatches one undoable command.
Offset and Outline create sibling spline layers. Chamfer and Fillet update a
source contour. Distance and radius are in local pixels. The scene stores the
resulting geometry. A persistent modifier stack would require saved operation
records and ordered evaluation.

**Mesh settings** exposes the existing saved source, texture, deformation clip,
and pins. Source includes grid dimensions and topology settings for structured
grids, or regeneration settings for a linked boundary. A shape can supply a
Mesh2D boundary while its own geometry remains editable in Properties.
