// ── Spline Object LayerDefinitions ────────────────────────────────────────────
//
// One definition per SplinePrimitiveKind (MVP-1 = 8 kinds). All share
// type:'spline', category:'Spline Objects', and toPath() → PathDefinition for
// trim / motion-path / SVG export.
//
// NOTE (granular rewrite): geometry is now point-based. Parametric geometry
// sliders (radius, sides…) are intentionally NOT exposed here yet — geometry is
// edited via direct point manipulation (Sprint 4) and parametric regeneration
// (Sprint 5). Only Transform / Appearance / Fill / Stroke are shown for now.

import type { Layer }              from '@/lib/types'
import type { LayerDefinition }    from '../../LayerDefinition'
import type { PropertyGroup }      from '../../PropertySchema'
import { newSplineLayerFromPrimitive } from '@/lib/defaults'
import { splineToPathDefinition }  from '@/lib/spline/splineToPath'
import {
  transformGroup, appearanceGroup, fillGroup, strokeGroup, trimGroup,
} from '../sharedSchemas'

function splineGroups(): PropertyGroup[] {
  return [
    transformGroup(),
    appearanceGroup(),
    fillGroup(),
    strokeGroup(),
    trimGroup(),
  ]
}

function toPath(layer: Layer) {
  if (!layer.spline) return { commands: [], closed: false }
  return splineToPathDefinition(layer.spline)
}

function fallbackLayer(name: string): Layer {
  return {
    id: `spline_fb_${Date.now()}`, name, type: 'spline',
    transform: { x: 80, y: 80, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 },
    opacity: 1,
  }
}

function splineDef(
  kind: string,
  label: string,
  iconKey: string,
  make: () => Layer | null,
): LayerDefinition {
  return {
    kind, label, iconKey, category: 'Spline Objects',
    createDefault: () => make() ?? fallbackLayer(`${label} Spline`),
    getPropertyGroups: () => splineGroups(),
    toPath,
  }
}

export const circleSplineDefinition  = splineDef('splineCircle',  'Circle',    'circle',    () => newSplineLayerFromPrimitive('circle',    { radius: 80 }))
export const lineSplineDefinition    = splineDef('splineLine',    'Line',      'line',      () => newSplineLayerFromPrimitive('line',      { x1: -80, y1: 0, x2: 80, y2: 0 }))
export const rectSplineDefinition    = splineDef('splineRect',    'Rectangle', 'rectangle', () => newSplineLayerFromPrimitive('rectangle', { width: 160, height: 100, cornerMode: 'sharp' }))
export const ellipseSplineDefinition = splineDef('splineEllipse', 'Ellipse',   'ellipse',   () => newSplineLayerFromPrimitive('ellipse',   { radiusX: 100, radiusY: 60 }))
export const arcSplineDefinition     = splineDef('splineArc',     'Arc',       'arc',       () => newSplineLayerFromPrimitive('arc',       { radius: 80, startAngle: -90, endAngle: 90 }))
export const donutSplineDefinition   = splineDef('splineDonut',   'Donut',     'ring',      () => newSplineLayerFromPrimitive('donut',     { outerRadius: 80, innerRadius: 40 }))
export const ngonSplineDefinition    = splineDef('splineNGon',    'NGon',      'polygon',   () => newSplineLayerFromPrimitive('ngon',      { sides: 6, radius: 80 }))
export const starSplineDefinition    = splineDef('splineStar',    'Star',      'star',      () => newSplineLayerFromPrimitive('star',      { points: 5, outerRadius: 80, innerRadius: 36 }))

export const ALL_SPLINE_DEFINITIONS: LayerDefinition[] = [
  circleSplineDefinition,
  lineSplineDefinition,
  rectSplineDefinition,
  ellipseSplineDefinition,
  arcSplineDefinition,
  donutSplineDefinition,
  ngonSplineDefinition,
  starSplineDefinition,
]
