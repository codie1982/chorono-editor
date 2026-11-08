import type { Layer } from '@/lib/types'
import type { PathBounds } from '@/lib/geometry/computePathBounds'
import { computePathBounds } from '@/lib/geometry/computePathBounds'
import { bezierPathToPathDefinition } from '@/lib/path/bezierToPathDefinition'
import { splineToPathDefinition } from '@/lib/spline/splineToPath'

/** Conservative local enclosure for certified native renderers, in scene pixels.
 * Text ink, particles, path-stroke glow, arbitrary shapes and natural-size images
 * deliberately return unknown. Reuses the renderer's actual path converters.
 * Caller supplies the materialized frame, so animated widths/geometry are live.
 * Invalid geometry is never used to reject a draw. No cache or DOM state is owned. */
export function nativePaintBounds(layer: Layer, context: CanvasRenderingContext2D): PathBounds | null {
  let bounds: PathBounds | null = null
  if (layer.type === 'path' && layer.path?.anchors.length) {
    bounds = computePathBounds(bezierPathToPathDefinition(layer.path), undefined, 'control-hull')
  } else if (layer.type === 'spline' && layer.spline) {
    bounds = computePathBounds(splineToPathDefinition(layer.spline), undefined, 'control-hull')
  } else if (layer.size) {
    const boxShape = layer.type === 'shape' && ['rect', 'circle', 'ellipse', 'capsule', 'polygon', 'ring', 'arc']
      .includes(layer.shapeKind ?? layer.shape ?? 'rect')
    const boxMedia = layer.type === 'video' || layer.type === 'frameSequence'
      || (layer.type === 'image' && layer.image?.objectFit !== 'none')
    if (boxShape || boxMedia) bounds = { x: 0, y: 0, ...layer.size }
  }
  if (!bounds || !Object.values(bounds).every(Number.isFinite) || bounds.width < 0 || bounds.height < 0) return null
  const stroke = ['shape', 'path', 'spline'].includes(layer.type) ? layer.style?.stroke : undefined
  // Outside-aligned strokes double the native width. Miter joins and square
  // caps can extend beyond half-width. Zero/invalid Canvas lineWidth preserves
  // the inherited width; include it rather than treating zero as no paint.
  const padding = stroke ? Math.max(Math.abs(stroke.width), context.lineWidth)
    * Math.max(2, context.miterLimit) : 0
  if (!Number.isFinite(padding)) return null
  return { x: bounds.x - padding, y: bounds.y - padding,
    width: bounds.width + padding * 2, height: bounds.height + padding * 2 }
}
