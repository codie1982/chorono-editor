// ── Spline Actions (BL-73 AI surface) ─────────────────────────────────────────
// add_spline creates an editable spline primitive (circle/rect/ellipse/arc/donut/
// ngon/star/line). Wraps newSplineLayerFromPrimitive. Unlike basic shapes, spline
// layers carry an editable point/handle/contour model.

import type { Layer, SplineGeneratorParams, SplinePrimitiveKind } from '@/lib/types'
import { newSplineLayerFromPrimitive } from '@/lib/defaults'
import { makeAddLayerCmd } from '@/lib/editor/commands-layer'
import type { ActionRegistry } from '../ActionRegistry'

const SPLINE_KIND_ENUM = ['circle', 'ellipse', 'rectangle', 'line', 'arc', 'donut', 'ngon', 'star']

interface AddSplineParams {
  id: string
  name?: string
  kind: 'circle' | 'ellipse' | 'rectangle' | 'line' | 'arc' | 'donut' | 'ngon' | 'star'
  x?: number; y?: number
  fillColor?: string
  strokeColor?: string
  strokeWidth?: number
  // per-kind geometry
  radius?: number
  radiusX?: number; radiusY?: number
  width?: number; height?: number; cornerRadius?: number
  x1?: number; y1?: number; x2?: number; y2?: number
  startAngle?: number; endAngle?: number
  outerRadius?: number; innerRadius?: number
  sides?: number; points?: number; roundness?: number
}

export function registerSplineActions(reg: ActionRegistry): void {
  reg.register<AddSplineParams>({
    id: 'spline.add',
    toolName: 'add_spline',
    description:
      'Create an editable spline primitive (circle/ellipse/rectangle/line/arc/donut/ngon/star). ' +
      'Use over add_layer shapes when the user wants an editable vector path (points/handles). ' +
      'Each kind takes its own geometry params (radius, sides, angles…).',
    parameters: {
      type: 'object',
      required: ['id', 'kind'],
      properties: {
        id:   { type: 'string', description: 'Unique layer id' },
        name: { type: 'string', description: 'Display name' },
        kind: { type: 'string', enum: SPLINE_KIND_ENUM, description: 'Primitive kind' },
        x:    { type: 'number', description: 'Layer x position' },
        y:    { type: 'number', description: 'Layer y position' },
        fillColor:   { type: 'string', description: 'Fill hex (closed shapes)' },
        strokeColor: { type: 'string', description: 'Stroke hex' },
        strokeWidth: { type: 'number', description: 'Stroke width px' },
        radius:      { type: 'number', description: 'circle / arc / donut(outer via outerRadius) / ngon radius' },
        radiusX:     { type: 'number', description: 'ellipse x radius' },
        radiusY:     { type: 'number', description: 'ellipse y radius' },
        width:       { type: 'number', description: 'rectangle width' },
        height:      { type: 'number', description: 'rectangle height' },
        cornerRadius:{ type: 'number', description: 'rectangle corner radius' },
        x1: { type: 'number', description: 'line start x' },
        y1: { type: 'number', description: 'line start y' },
        x2: { type: 'number', description: 'line end x' },
        y2: { type: 'number', description: 'line end y' },
        startAngle: { type: 'number', description: 'arc start angle (deg)' },
        endAngle:   { type: 'number', description: 'arc end angle (deg)' },
        outerRadius:{ type: 'number', description: 'donut/star outer radius' },
        innerRadius:{ type: 'number', description: 'donut/star inner radius' },
        sides:      { type: 'number', description: 'ngon side count' },
        points:     { type: 'number', description: 'star point count' },
        roundness:  { type: 'number', description: 'ngon/star corner roundness 0–1' },
      },
    },
    toCommand: (p, scene) => {
      if (!p.id || !p.kind) return errorCmd('add_spline missing id / kind')
      if (scene.layers.some((l) => l.id === p.id)) {
        return errorCmd(`layer id "${p.id}" already exists`)
      }
      const params = buildSplineParams(p)
      if (!params) return errorCmd(`unsupported spline kind "${p.kind}"`)
      const base = newSplineLayerFromPrimitive(p.kind as SplinePrimitiveKind, params)
      if (!base) return errorCmd(`could not build spline "${p.kind}"`)

      const layer: Layer = {
        ...base,
        id: p.id,
        name: p.name ?? p.id,
        transform: { ...base.transform, x: p.x ?? base.transform.x, y: p.y ?? base.transform.y },
        style: {
          ...base.style,
          ...(p.fillColor ? { fill: { type: 'solid' as const, color: p.fillColor } } : {}),
          ...(p.strokeColor || p.strokeWidth != null
            ? { stroke: {
                color: p.strokeColor ?? base.style?.stroke?.color ?? '#FFFFFF',
                width: p.strokeWidth ?? base.style?.stroke?.width ?? 1,
              } }
            : {}),
        },
      }
      return makeAddLayerCmd(layer)
    },
  })
}

function buildSplineParams(p: AddSplineParams): SplineGeneratorParams | null {
  switch (p.kind) {
    case 'circle':    return { radius: p.radius ?? 50 }
    case 'ellipse':   return { radiusX: p.radiusX ?? 60, radiusY: p.radiusY ?? 40 }
    case 'rectangle': return {
      width: p.width ?? 100, height: p.height ?? 80,
      ...(p.cornerRadius != null ? { cornerRadius: p.cornerRadius, cornerMode: 'rounded' as const } : {}),
    }
    case 'line':      return { x1: p.x1 ?? 0, y1: p.y1 ?? 0, x2: p.x2 ?? 100, y2: p.y2 ?? 0 }
    case 'arc':       return { radius: p.radius ?? 50, startAngle: p.startAngle ?? 0, endAngle: p.endAngle ?? 180 }
    case 'donut':     return { outerRadius: p.outerRadius ?? p.radius ?? 60, innerRadius: p.innerRadius ?? 30 }
    case 'ngon':      return {
      sides: p.sides ?? 6, radius: p.radius ?? 50,
      ...(p.roundness != null ? { roundness: p.roundness } : {}),
    }
    case 'star':      return {
      points: p.points ?? 5, outerRadius: p.outerRadius ?? p.radius ?? 60, innerRadius: p.innerRadius ?? 25,
      ...(p.roundness != null ? { roundness: p.roundness } : {}),
    }
    default:          return null
  }
}

function errorCmd(message: string) {
  return {
    label: `AI ERROR: ${message}`,
    execute: <S,>(s: S): S => s,
    undo:    <S,>(s: S): S => s,
  }
}
