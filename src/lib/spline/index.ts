export { splineToPathDefinition }  from './splineToPath'
export { createSplinePrimitive }   from './factory/createSplinePrimitive'
export { appendSplinePrimitiveToSplineData } from './factory/appendSplinePrimitiveToLayer'
export { computeSplineBounds }     from './geometry/computeSplineBounds'
export type { SplineBounds }       from './geometry/computeSplineBounds'
export {
  createCircleSpline, createLineSpline, createRectangleSpline, createEllipseSpline,
  createArcSpline, createDonutSpline, createNGonSpline, createStarSpline,
} from './primitives'
