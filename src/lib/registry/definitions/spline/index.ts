// ── Spline Object LayerDefinitions ────────────────────────────────────────────
//
// One definition per SplinePrimitiveKind (MVP-1 = 8 kinds).
// All share type:'spline', category:'Spline Objects', fill+stroke groups,
// and toPath() → PathDefinition for trim / motion-path / SVG export.

import type { Layer }              from '@/lib/types'
import type { LayerDefinition }    from '../../LayerDefinition'
import type { PropertyGroup }      from '../../PropertySchema'
import { newSplineLayer }          from '@/lib/defaults'
import { splineToPathDefinition }  from '@/lib/spline/splineToPath'
import {
  transformGroup, appearanceGroup,
  fillGroup, strokeGroup, trimGroup, geometryGroup,
} from '../sharedSchemas'

// ── Shared base groups ────────────────────────────────────────────────────────

function splineBaseGroups(extra: PropertyGroup[] = []): PropertyGroup[] {
  return [
    transformGroup(),
    appearanceGroup(),
    fillGroup(),
    strokeGroup(),
    ...extra,
    trimGroup(),
  ]
}

// ── toPath helper ─────────────────────────────────────────────────────────────

function toPath(layer: Layer) {
  if (!layer.spline) return { commands: [], closed: false }
  return splineToPathDefinition(layer.spline)
}

// ── Fallback factory (should never be hit if newSplineLayer is correct) ───────

function fallbackLayer(name: string): Layer {
  return {
    id: `spline_fb_${Date.now()}`, name,
    type: 'spline',
    transform: { x: 80, y: 80, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 },
    opacity: 1,
  }
}

// ── Circle ────────────────────────────────────────────────────────────────────

export const circleSplineDefinition: LayerDefinition = {
  kind: 'splineCircle', label: 'Circle', iconKey: 'circle', category: 'Spline Objects',
  createDefault: () => newSplineLayer('circle', { radius: 80 }) ?? fallbackLayer('Circle Spline'),
  getPropertyGroups: () => splineBaseGroups([
    geometryGroup([
      { id: 'radius', path: 'spline.subShapes[0].generatorParams.radius', group: 'Geometry', label: 'Radius', valueType: 'number', animatable: false, defaultValue: 80, min: 1 },
    ]),
  ]),
  toPath,
}

// ── Line ──────────────────────────────────────────────────────────────────────

export const lineSplineDefinition: LayerDefinition = {
  kind: 'splineLine', label: 'Line', iconKey: 'line', category: 'Spline Objects',
  createDefault: () => newSplineLayer('line', { x1: -80, y1: 0, x2: 80, y2: 0 }) ?? fallbackLayer('Line Spline'),
  getPropertyGroups: () => splineBaseGroups([
    geometryGroup([
      { id: 'x1', path: 'spline.subShapes[0].generatorParams.x1', group: 'Geometry', label: 'Start X', valueType: 'number', animatable: false, defaultValue: -80 },
      { id: 'y1', path: 'spline.subShapes[0].generatorParams.y1', group: 'Geometry', label: 'Start Y', valueType: 'number', animatable: false, defaultValue: 0   },
      { id: 'x2', path: 'spline.subShapes[0].generatorParams.x2', group: 'Geometry', label: 'End X',   valueType: 'number', animatable: false, defaultValue: 80  },
      { id: 'y2', path: 'spline.subShapes[0].generatorParams.y2', group: 'Geometry', label: 'End Y',   valueType: 'number', animatable: false, defaultValue: 0   },
    ]),
  ]),
  toPath,
}

// ── Rectangle ─────────────────────────────────────────────────────────────────

export const rectSplineDefinition: LayerDefinition = {
  kind: 'splineRect', label: 'Rectangle', iconKey: 'rectangle', category: 'Spline Objects',
  createDefault: () => newSplineLayer('rectangle', { width: 160, height: 100, cornerMode: '4-point' }) ?? fallbackLayer('Rectangle Spline'),
  getPropertyGroups: () => splineBaseGroups([
    geometryGroup([
      { id: 'rw',   path: 'spline.subShapes[0].generatorParams.width',        group: 'Geometry', label: 'Width',       valueType: 'number', animatable: false, defaultValue: 160, min: 1 },
      { id: 'rh',   path: 'spline.subShapes[0].generatorParams.height',       group: 'Geometry', label: 'Height',      valueType: 'number', animatable: false, defaultValue: 100, min: 1 },
      { id: 'rcr',  path: 'spline.subShapes[0].generatorParams.cornerRadius', group: 'Geometry', label: 'Corner R',    valueType: 'number', animatable: false, defaultValue: 0,   min: 0 },
      { id: 'rcm',  path: 'spline.subShapes[0].generatorParams.cornerMode',   group: 'Geometry', label: 'Corner Mode', valueType: 'select', animatable: false, defaultValue: '4-point',
        options: [{ value: '4-point', label: 'Sharp' }, { value: '8-point', label: 'Chamfered' }, { value: 'cubic-rounded', label: 'Rounded' }] },
    ]),
  ]),
  toPath,
}

// ── Ellipse ───────────────────────────────────────────────────────────────────

export const ellipseSplineDefinition: LayerDefinition = {
  kind: 'splineEllipse', label: 'Ellipse', iconKey: 'ellipse', category: 'Spline Objects',
  createDefault: () => newSplineLayer('ellipse', { radiusX: 100, radiusY: 60 }) ?? fallbackLayer('Ellipse Spline'),
  getPropertyGroups: () => splineBaseGroups([
    geometryGroup([
      { id: 'erx', path: 'spline.subShapes[0].generatorParams.radiusX', group: 'Geometry', label: 'Radius X', valueType: 'number', animatable: false, defaultValue: 100, min: 1 },
      { id: 'ery', path: 'spline.subShapes[0].generatorParams.radiusY', group: 'Geometry', label: 'Radius Y', valueType: 'number', animatable: false, defaultValue: 60,  min: 1 },
    ]),
  ]),
  toPath,
}

// ── Arc ───────────────────────────────────────────────────────────────────────

export const arcSplineDefinition: LayerDefinition = {
  kind: 'splineArc', label: 'Arc', iconKey: 'arc', category: 'Spline Objects',
  createDefault: () => newSplineLayer('arc', { radius: 80, startAngle: -90, endAngle: 90 }) ?? fallbackLayer('Arc Spline'),
  getPropertyGroups: () => splineBaseGroups([
    geometryGroup([
      { id: 'ar',  path: 'spline.subShapes[0].generatorParams.radius',     group: 'Geometry', label: 'Radius',  valueType: 'number', animatable: false, defaultValue: 80  },
      { id: 'asa', path: 'spline.subShapes[0].generatorParams.startAngle', group: 'Geometry', label: 'Start °', valueType: 'angle',  animatable: false, defaultValue: -90 },
      { id: 'aea', path: 'spline.subShapes[0].generatorParams.endAngle',   group: 'Geometry', label: 'End °',   valueType: 'angle',  animatable: false, defaultValue: 90  },
    ]),
  ]),
  toPath,
}

// ── Donut ─────────────────────────────────────────────────────────────────────

export const donutSplineDefinition: LayerDefinition = {
  kind: 'splineDonut', label: 'Donut', iconKey: 'ring', category: 'Spline Objects',
  createDefault: () => newSplineLayer('donut', { outerRadius: 80, innerRadius: 40 }) ?? fallbackLayer('Donut Spline'),
  getPropertyGroups: () => splineBaseGroups([
    geometryGroup([
      { id: 'dor', path: 'spline.subShapes[0].generatorParams.outerRadius', group: 'Geometry', label: 'Outer R', valueType: 'number', animatable: false, defaultValue: 80, min: 1 },
      { id: 'dir', path: 'spline.subShapes[0].generatorParams.innerRadius', group: 'Geometry', label: 'Inner R', valueType: 'number', animatable: false, defaultValue: 40, min: 1 },
    ]),
  ]),
  toPath,
}

// ── NGon ──────────────────────────────────────────────────────────────────────

export const ngonSplineDefinition: LayerDefinition = {
  kind: 'splineNGon', label: 'NGon', iconKey: 'polygon', category: 'Spline Objects',
  createDefault: () => newSplineLayer('ngon', { sides: 6, radius: 80 }) ?? fallbackLayer('NGon Spline'),
  getPropertyGroups: () => splineBaseGroups([
    geometryGroup([
      { id: 'ngs',  path: 'spline.subShapes[0].generatorParams.sides',     group: 'Geometry', label: 'Sides',     valueType: 'number',  animatable: false, defaultValue: 6,  min: 3, max: 32, step: 1 },
      { id: 'ngr',  path: 'spline.subShapes[0].generatorParams.radius',    group: 'Geometry', label: 'Radius',    valueType: 'number',  animatable: false, defaultValue: 80, min: 1 },
      { id: 'ngrn', path: 'spline.subShapes[0].generatorParams.roundness', group: 'Geometry', label: 'Roundness', valueType: 'percent', animatable: false, defaultValue: 0,  min: 0, max: 1, step: 0.05 },
    ]),
  ]),
  toPath,
}

// ── Star ──────────────────────────────────────────────────────────────────────

export const starSplineDefinition: LayerDefinition = {
  kind: 'splineStar', label: 'Star', iconKey: 'star', category: 'Spline Objects',
  createDefault: () => newSplineLayer('star', { points: 5, outerRadius: 80, innerRadius: 36 }) ?? fallbackLayer('Star Spline'),
  getPropertyGroups: () => splineBaseGroups([
    geometryGroup([
      { id: 'stp',  path: 'spline.subShapes[0].generatorParams.points',      group: 'Geometry', label: 'Points',    valueType: 'number',  animatable: false, defaultValue: 5,  min: 3, max: 12, step: 1 },
      { id: 'stor', path: 'spline.subShapes[0].generatorParams.outerRadius', group: 'Geometry', label: 'Outer R',   valueType: 'number',  animatable: false, defaultValue: 80, min: 1 },
      { id: 'stir', path: 'spline.subShapes[0].generatorParams.innerRadius', group: 'Geometry', label: 'Inner R',   valueType: 'number',  animatable: false, defaultValue: 36, min: 1 },
      { id: 'strn', path: 'spline.subShapes[0].generatorParams.roundness',   group: 'Geometry', label: 'Roundness', valueType: 'percent', animatable: false, defaultValue: 0,  min: 0, max: 1, step: 0.05 },
    ]),
  ]),
  toPath,
}

// ── All definitions ───────────────────────────────────────────────────────────

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
