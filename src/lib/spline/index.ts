export { splineToPathDefinition }  from './splineToPath'
export { createSplinePrimitive }   from './factory/createSplinePrimitive'
export { appendSplinePrimitiveToSplineData } from './factory/appendSplinePrimitiveToLayer'
export { mergeSplineData }          from './factory/mergeSplineData'
export { computeSplineBounds }     from './geometry/computeSplineBounds'
export type { SplineBounds }       from './geometry/computeSplineBounds'
export { translateSplineData }     from './geometry/translateSplineData'
export { transformSplineData }     from './geometry/transformSplineData'
export { placeSplineInLayer }      from './creation/placeSplineInLayer'
export {
  hitTestSplinePoint, hitTestSplineHandle, hitTestSplineSegment, hitTestSplineContour,
} from './geometry/hitTest'
export type { SegmentHit, HandleHit } from './geometry/hitTest'
export { splineParamsFromBox, isBoxDragKind, createPolylineSpline } from './creation'
export type { DrawBox, BoxSplineSpec } from './creation'
export {
  moveSplinePoint, moveSplineHandle, insertPointOnSegment, deleteSplinePoint,
  setSplinePointType, setSegmentType, setContourClosed, reverseContour,
} from './edit'
export {
  createCircleSpline, createLineSpline, createRectangleSpline, createEllipseSpline,
  createArcSpline, createDonutSpline, createNGonSpline, createStarSpline,
} from './primitives'
