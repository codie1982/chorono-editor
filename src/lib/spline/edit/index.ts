export {
  moveSplinePoint, moveSplineHandle, insertPointOnSegment, deleteSplinePoint,
  setSplinePointType, setSegmentType, setContourClosed, reverseContour,
} from './mutations'
export { extendSplineContour, splineContinuation } from './extendSplineContour'
export { copySplineTangents, pasteSplineTangents, resetSplineTangents, fuseSplinePoints } from './tangents'
export type { SplineTangents } from './tangents'
export { addSplineVertex } from './addVertex'
export type { SplineVertexType } from './addVertex'
export { simplifySplineObjects } from './simplifyObjects'
export { smoothSplineObjects } from './smoothObjects'
