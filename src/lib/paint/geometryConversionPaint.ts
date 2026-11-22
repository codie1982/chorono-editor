import type { ShapeStyle } from '../types/style'
import { strokeType, withFillType, withStrokeType } from './paintSource'

/** Apply representation-entry paint defaults, shared by modifier and legacy
 * conversion adapters. Shape/Mesh → Spline disables fill while retaining its
 * payload/mode and ensures a nonzero stroke. Entering Mesh restores remembered
 * fill or uses the contour color; entering Shape restores a remembered fill.
 * Same-kind evaluation preserves explicit user paint edits, including None.
 * Inputs are borrowed, output is fresh when changed, and animation/geometry,
 * opacity tracks, UVs and topology are never modified. Stroke width is local px.
 * Legacy None without a remembered mode becomes solid on Mesh conversion. */
export function geometryConversionPaint(style: ShapeStyle | undefined, previousKind: string,
  nextKind: 'shape' | 'spline' | 'mesh2d'): ShapeStyle | undefined {
  if (previousKind === nextKind) return style
  const fill = style?.fill, stroke = style?.stroke
  if (nextKind === 'spline') {
    const visible = stroke && strokeType(stroke) !== 'none' && stroke.width > 0 && (stroke.opacity ?? 100) > 0
    const contour = visible ? stroke : { ...withStrokeType(stroke, 'solid'),
      width: stroke && stroke.width > 0 ? stroke.width : 2,
      color: stroke && stroke.width > 0 ? stroke.color : fill?.color ?? fill?.gradient?.stops[0]?.color ?? '#3B82F6',
      opacity: stroke && (stroke.opacity ?? 100) > 0 ? stroke.opacity : 100 }
    return { ...style, fill: withFillType(fill, 'none'), stroke: contour }
  }
  if (fill && fill.type !== 'none') return style
  if (nextKind === 'shape' && !fill?.disabledType) return style
  const restored = withFillType({ ...fill, type: fill?.type ?? 'none',
    color: fill?.color ?? stroke?.color ?? '#3B82F6' }, fill?.disabledType ?? 'solid')
  return { ...style, fill: { ...restored, ...((restored.opacity ?? 100) <= 0 ? { opacity: 100 } : {}) } }
}
