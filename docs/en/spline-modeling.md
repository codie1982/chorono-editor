# Spline modeling: Offset, Outline, Chamfer and Fillet

The **Spline Modeling** dock tab works on a selected spline layer. Open it from the Properties button or restore the tab from View. Choose a contour, an operation, and a positive distance in **layer-local pixels**. Offset and Outline use outward/inward for closed contours and left/right relative to contour order for open contours. Preview is temporary; **Apply** commits one undo step and **Cancel** discards it. Changing the source document or revision after Preview requires a fresh Preview.

Offset creates a new sibling spline layer containing one parallel contour. Outline creates a new sibling with a band: two even-odd contours for a closed source or a capped strip for an open source. The original geometry and its animation remain untouched. Chamfer and Fillet replace only the selected contour of the original layer. Select multiple eligible corners in the panel or use the current canvas point. Open endpoints and locked points are ineligible. A contour with animation tracks addressed to records being replaced is rejected; bake or remove those tracks first. Other contours and their IDs are preserved.

Curves are sampled with a maximum 0.25 layer-local pixel chord deviation up to depth 12. Offset distance is measured on those sampled edges. Chamfer cuts by sampled arc distance. Fillet uses an exact requested radius for two straight edges and a tangent cubic approximation when either edge curves. Severe concavity, self intersections, zero-length edges, overlapping cuts and collapsed offsets are rejected. Very large scale/zoom can make the 0.25 local-pixel approximation visible. These operations are destructive geometry edits after Apply; the result remains ordinary editable spline data and uses the existing render, portable save/load and export paths.

The reusable geometry entry points are `createOffsetOutline` and `treatSplineCorners` in `src/lib/spline/modeling`. `sampleContourEdges` owns flattening, `assertContourAnimationSafe` checks tracks before replacement, and `modeledSplineLayer` creates detached sibling layers. The dock panel owns Preview and runs the guard again on Apply. Spline script methods share those functions:

```js
const spline = scene.get('spline_1').spline
const contourId = Object.keys(spline.data.contours)[0]
const pointId = spline.data.contours[contourId].pointIds[0]
const newLayerId = spline.offsetContour(contourId, 12, 'outward')
spline.chamferCorners(contourId, [pointId], 6)
// spline.outlineContour(contourId, 8, 'outward')
// spline.filletCorners(contourId, [pointId], 5)
```

Script calls apply immediately through native commands and return the new sibling layer ID for Offset/Outline. Use the panel when a visual Preview/Cancel step is needed. No new serialized spline fields or runtime classes are introduced.
