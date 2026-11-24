// ── Spline Primitive Factory ──────────────────────────────────────────────────
//
// Dispatches a (kind, params) request to the matching granular generator and
// returns a complete SplinePathData (one SubShape). Returns null for
// kinds without a parametric factory, including gesture-authored freehand.

import type {
  SplinePathData, SplinePrimitiveKind, SplineGeneratorParams,
  SpiralSplineParams, CircleSplineParams, LineSplineParams, RectSplineParams, EllipseSplineParams,
  ArcSplineParams, DonutSplineParams, NGonSplineParams, StarSplineParams,
} from '@/lib/types/spline'
import {
  createCircleSpline, createLineSpline, createRectangleSpline, createEllipseSpline,
  createArcSpline, createDonutSpline, createNGonSpline, createStarSpline,
} from '../primitives'

import { ShapeToPathConverter } from '../../geometry/ShapeToPathConverter'
import { buildSplineData } from '../util/buildSplineData'

export interface CreateSplinePrimitiveInput {
  kind:   SplinePrimitiveKind
  params: SplineGeneratorParams
}

export function createSplinePrimitive(input: CreateSplinePrimitiveInput): SplinePathData | null {
  switch (input.kind) {
    case 'circle':    return createCircleSpline(input.params as CircleSplineParams)
    case 'line':      return createLineSpline(input.params as LineSplineParams)
    case 'rectangle': return createRectangleSpline(input.params as RectSplineParams)
    case 'ellipse':   return createEllipseSpline(input.params as EllipseSplineParams)
    case 'arc':       return createArcSpline(input.params as ArcSplineParams)
    case 'donut':     return createDonutSpline(input.params as DonutSplineParams)
    case 'ngon':      return createNGonSpline(input.params as NGonSplineParams)
    case 'spiral': {
      const params=input.params as SpiralSplineParams
      const radius=Math.max(params.endRadius,params.startRadius,1)
      if(![params.endRadius,params.startRadius,params.turns].every(Number.isFinite))return null
      const path=ShapeToPathConverter.convert('spiral',{width:2*radius,height:2*radius},{kind:'spiral',...params})
      const anchors=path.commands.flatMap(c=>c.type==='M'||c.type==='L'?[{x:c.x-radius,y:c.y-radius,type:'corner' as const}]:[])
      return buildSplineData({kind:'spiral',name:'Spiral',params,contours:[{closed:false,anchors}]})
    }
    case 'star':      return createStarSpline(input.params as StarSplineParams)
    default:          return null
  }
}
