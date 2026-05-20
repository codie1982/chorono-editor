// ── Spline Primitive Factory ──────────────────────────────────────────────────
//
// Dispatches to the correct primitive generator and wraps the result in a
// complete SplinePathData ready to store on a Layer.

import type {
  SplinePathData, SplinePrimitiveKind, SplineGeneratorParams,
  CircleSplineParams, LineSplineParams, RectSplineParams, EllipseSplineParams,
  ArcSplineParams, DonutSplineParams, NGonSplineParams, StarSplineParams,
} from '@/lib/types/spline'
import { createCircleSpline }    from '../primitives/createCircleSpline'
import { createLineSpline }      from '../primitives/createLineSpline'
import { createRectangleSpline } from '../primitives/createRectangleSpline'
import { createEllipseSpline }   from '../primitives/createEllipseSpline'
import { createArcSpline }       from '../primitives/createArcSpline'
import { createDonutSpline }     from '../primitives/createDonutSpline'
import { createNGonSpline }      from '../primitives/createNGonSpline'
import { createStarSpline }      from '../primitives/createStarSpline'

let _idCounter = 0
function uid(prefix: string): string {
  return `${prefix}_${++_idCounter}_${Math.random().toString(36).slice(2, 6)}`
}

export interface CreateSplinePrimitiveOptions {
  kind:   SplinePrimitiveKind
  params: SplineGeneratorParams
  order?: number
}

export function createSplinePrimitive(opts: CreateSplinePrimitiveOptions): SplinePathData | null {
  const { kind, params, order = 0 } = opts

  switch (kind) {
    case 'circle': {
      const subId = uid('sub'), cId = uid('cnt')
      return {
        subShapes: { [subId]: { id: subId, name: 'Circle', kind, order, contourIds: [cId], combineMode: 'add', source: 'generated', generatorParams: params, editable: false } },
        contours:  { [cId]: createCircleSpline(params as CircleSplineParams) },
        fillRule:  'nonzero',
      }
    }
    case 'line': {
      const subId = uid('sub'), cId = uid('cnt')
      return {
        subShapes: { [subId]: { id: subId, name: 'Line', kind, order, contourIds: [cId], combineMode: 'none', source: 'generated', generatorParams: params, editable: false } },
        contours:  { [cId]: createLineSpline(params as LineSplineParams) },
        fillRule:  'nonzero',
      }
    }
    case 'rectangle': {
      const subId = uid('sub'), cId = uid('cnt')
      return {
        subShapes: { [subId]: { id: subId, name: 'Rectangle', kind, order, contourIds: [cId], combineMode: 'add', source: 'generated', generatorParams: params, editable: false } },
        contours:  { [cId]: createRectangleSpline(params as RectSplineParams) },
        fillRule:  'nonzero',
      }
    }
    case 'ellipse': {
      const subId = uid('sub'), cId = uid('cnt')
      return {
        subShapes: { [subId]: { id: subId, name: 'Ellipse', kind, order, contourIds: [cId], combineMode: 'add', source: 'generated', generatorParams: params, editable: false } },
        contours:  { [cId]: createEllipseSpline(params as EllipseSplineParams) },
        fillRule:  'nonzero',
      }
    }
    case 'arc': {
      const subId = uid('sub'), cId = uid('cnt')
      return {
        subShapes: { [subId]: { id: subId, name: 'Arc', kind, order, contourIds: [cId], combineMode: 'none', source: 'generated', generatorParams: params, editable: false } },
        contours:  { [cId]: createArcSpline(params as ArcSplineParams) },
        fillRule:  'nonzero',
      }
    }
    case 'donut': {
      const subId = uid('sub'), outerCId = uid('cnt'), innerCId = uid('cnt')
      const { outer, inner } = createDonutSpline(params as DonutSplineParams)
      return {
        subShapes: { [subId]: { id: subId, name: 'Donut', kind, order, contourIds: [outerCId, innerCId], combineMode: 'add', source: 'generated', generatorParams: params, editable: false } },
        contours:  { [outerCId]: outer, [innerCId]: inner },
        fillRule:  'evenodd',
      }
    }
    case 'ngon': {
      const subId = uid('sub'), cId = uid('cnt')
      return {
        subShapes: { [subId]: { id: subId, name: 'NGon', kind, order, contourIds: [cId], combineMode: 'add', source: 'generated', generatorParams: params, editable: false } },
        contours:  { [cId]: createNGonSpline(params as NGonSplineParams) },
        fillRule:  'nonzero',
      }
    }
    case 'star': {
      const subId = uid('sub'), cId = uid('cnt')
      return {
        subShapes: { [subId]: { id: subId, name: 'Star', kind, order, contourIds: [cId], combineMode: 'add', source: 'generated', generatorParams: params, editable: false } },
        contours:  { [cId]: createStarSpline(params as StarSplineParams) },
        fillRule:  'nonzero',
      }
    }

    default:
      return null
  }
}
