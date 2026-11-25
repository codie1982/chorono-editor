import type { Layer, GradientFill } from '../../types'
import { validateExpressionResult } from '../../core/expression/ExpressionValue'
import { propertyPathsOverlap } from '../../scene/properties/propertyPathsOverlap'
import { changedScriptPaths } from './ScriptDataChanges'

/** Validate one edited gradient in source units. Stops remain in authored order;
 * offsets are 0..1, angles are degrees and CSS colors are never coerced. */
function gradient(value: GradientFill): void {
  if (!value || !['linear','radial','angle','reflected','diamond'].includes(value.type) || !Array.isArray(value.stops) || value.stops.length < 2 || value.stops.length > 256) throw new Error('Invalid gradient: use a supported gradient type with 2..256 stops.')
  if (value.angle !== undefined && (typeof value.angle !== 'number' || !Number.isFinite(value.angle))) throw new Error('Gradient angle must be finite.')
  for (const stop of value.stops) {
    if (!stop || typeof stop.offset !== 'number' || !Number.isFinite(stop.offset) || stop.offset < 0 || stop.offset > 1 || typeof stop.color !== 'string') throw new Error('Invalid gradient stop.')
    if (stop.opacity !== undefined && (!Number.isFinite(stop.opacity) || stop.opacity < 0 || stop.opacity > 100)) throw new Error('Gradient stop alpha must be 0..100.')
    validateExpressionResult('color', stop.color)
  }
}

/** Changed paint only. Preserves inactive legacy payloads and unknown extension
 * metadata unless that payload itself is edited. Removing optional fill/stroke
 * is legal; replacing a container must retain its required source fields. */
export function assertScriptPaint(before: Layer | undefined, after: Layer): void {
  const paths = changedScriptPaths(before?.style, after.style)
  const touched = (path: string) => paths.some(other => !other || propertyPathsOverlap(path, other))
  const fill = after.style?.fill, stroke = after.style?.stroke
  for (const name of ['fill','stroke'] as const) {
    const value = after.style?.[name]
    if (touched(name) && value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) throw new Error(`${name} must be a paint record.`)
  }
  if (fill && touched('fill.color') && fill.color !== undefined) { if (typeof fill.color !== 'string') throw new Error('Fill color must be CSS.'); validateExpressionResult('color', fill.color) }
  if (fill && touched('fill.opacity') && fill.opacity !== undefined && (typeof fill.opacity !== 'number' || !Number.isFinite(fill.opacity) || fill.opacity < 0 || fill.opacity > 100)) throw new Error('Fill opacity must be 0..100.')
  if (touched('cornerRadius') && after.style?.cornerRadius !== undefined && (typeof after.style.cornerRadius !== 'number' || !Number.isFinite(after.style.cornerRadius) || after.style.cornerRadius < 0)) throw new Error('Corner radius must be non-negative.')
  if (fill && touched('fill.type') && !['solid','gradient','image','none'].includes(fill.type)) throw new Error('Invalid fill type.')
  if (fill && (touched('fill.gradient') && fill.gradient !== undefined || touched('fill.type') && fill.type === 'gradient')) gradient(fill.gradient!)
  if (stroke) {
    if (stroke.type === 'pattern' && !stroke.image) throw new Error('Pattern stroke requires image placement.')
    if (stroke.dashEnabled !== undefined && typeof stroke.dashEnabled !== 'boolean') throw new Error('Invalid dash enabled value.')
    if ((touched('stroke.color') || !before?.style?.stroke) && typeof stroke.color !== 'string') throw new Error('Stroke requires a CSS color.')
    if (touched('stroke.color')) validateExpressionResult('color', stroke.color)
    if ((touched('stroke.width') || !before?.style?.stroke) && (typeof stroke.width !== 'number' || !Number.isFinite(stroke.width) || stroke.width < 0)) throw new Error('Stroke width must be non-negative.')
    if (stroke.gradient && touched('stroke.gradient')) gradient(stroke.gradient)
    if (stroke.dashArray && touched('stroke.dashArray') && (!Array.isArray(stroke.dashArray) || stroke.dashArray.some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0))) throw new Error('Stroke dashes must be non-negative numbers.')
    if (touched('stroke.opacity') && stroke.opacity !== undefined && (typeof stroke.opacity !== 'number' || stroke.opacity < 0 || stroke.opacity > 100)) throw new Error('Stroke opacity must be 0..100.')
  }
}
