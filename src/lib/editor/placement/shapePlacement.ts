import type { Layer, ShapeKind, ShapeParams, Vec2 } from '../../types'

type PlaceableShapeKind = ShapeKind | 'circle'

/** Modifier policy for a new, registry-created primitive, in composition pixels. */
export interface ShapePlacementOptions {
  /** A click creates the default geometry at `start`; adapters decide click tolerance in CSS pixels. */
  useDefaultSize?: boolean
  /** Shift: square closed shapes, or snap lines/arrows to the nearest 45 degrees. */
  constrain?: boolean
}

const SUPPORTED_KINDS = new Set<PlaceableShapeKind>([
  'rect', 'circle', 'ellipse', 'line', 'arrow', 'polygon', 'star', 'ring',
  'arc', 'capsule', 'spiral', 'wave', 'blob',
])
const RADIAL_KINDS = new Set<PlaceableShapeKind>([
  'circle', 'polygon', 'star', 'ring', 'arc', 'spiral', 'blob',
])

/** Whether a factory layer has a supported parametric shape and positive finite default size.
 * Text, media, groups, splines and paths retain their dedicated creation workflows.
 * This tests geometry capability only; placement also requires a root template.
 */
export function canPlaceShape(layer: Layer): boolean {
  const kind = layer.shapeKind ?? layer.shape
  return layer.type === 'shape' && kind !== undefined && SUPPORTED_KINDS.has(kind)
    && layer.size !== undefined && finitePositive(layer.size.width) && finitePositive(layer.size.height)
}

/** Creates one immutable shape from a composition-space pointer gesture.
 *
 * `template` is a fresh registry default, never an existing scene layer. Its ID,
 * name, appearance and nonspatial parameters are retained. The returned root has
 * unit scale, zero rotation and a geometry-centered pivot. No scene, history or
 * caller-owned object is mutated, and there are no browser dependencies.
 *
 * Closed primitives use the normalized drag box (minimum one pixel per axis).
 * Radial converter primitives use a square whose side is the larger drag extent;
 * their renderer uses min(width,height), so a nonsquare nominal box would leave
 * unused margins. Shift constrains the remaining closed primitives to a square.
 * Lines/arrows instead start exactly at `start` and retain signed local endpoints
 * ending at `end`; their pivot is the endpoint midpoint. A click retains the
 * factory's dimensions/geometry, translated to `start`.
 *
 * Pixel radii and wave amplitude scale with their relevant geometry dimension;
 * style stroke widths, corner radii and arrowhead length retain factory values.
 * Blob noise can extend beyond its nominal square, matching existing geometry.
 * Throws for unsupported templates, parented templates, invalid coordinates or
 * overflowing dimensions. Input is not clamped to the composition artboard.
 */
export function placeShapeInGesture(template: Layer, start: Vec2, end: Vec2,
  options: ShapePlacementOptions = {}): Layer {
  if (!canPlaceShape(template)) throw new Error('Unsupported shape placement template')
  if (template.parentId) throw new Error('Shape placement requires a root factory template')
  if (![start.x, start.y, end.x, end.y].every(Number.isFinite)) {
    throw new Error('Shape placement requires finite composition coordinates')
  }
  const kind = (template.shapeKind ?? template.shape)!
  if (kind === 'line' || kind === 'arrow') return placeSegment(template, kind, start, end, options)

  const original = template.size!
  let width = original.width, height = original.height, x = start.x, y = start.y
  if (!options.useDefaultSize) {
    const dx = end.x - start.x, dy = end.y - start.y
    width = Math.max(1, Math.abs(dx)); height = Math.max(1, Math.abs(dy))
    if (options.constrain || RADIAL_KINDS.has(kind)) width = height = Math.max(width, height)
    x = dx < 0 ? start.x - width : start.x
    y = dy < 0 ? start.y - height : start.y
  }
  assertDimensions(x, y, width, height)
  const radialRatio = Math.min(width, height) / Math.min(original.width, original.height)
  const shapeParams = options.useDefaultSize ? template.shapeParams
    : resizeParameters(template.shapeParams, kind, radialRatio, height / original.height)
  return { ...template, size: { width, height }, shapeParams,
    transform: { ...template.transform, x, y, scaleX: 1, scaleY: 1, rotationDeg: 0,
      anchorX: width / 2, anchorY: height / 2 } }
}

/** Signed segment geometry preserves drawing direction, including negative/zero endpoints. */
function placeSegment(template: Layer, kind: 'line' | 'arrow', start: Vec2, end: Vec2,
  options: ShapePlacementOptions): Layer {
  let x2 = options.useDefaultSize ? (template.shapeParams?.x2 ?? template.size!.width) : end.x - start.x
  let y2 = options.useDefaultSize ? (template.shapeParams?.y2 ?? 0) : end.y - start.y
  if (options.constrain && !options.useDefaultSize) {
    const length = Math.hypot(x2, y2), angle = Math.round(Math.atan2(y2, x2) / (Math.PI / 4)) * Math.PI / 4
    x2 = length * Math.cos(angle); y2 = length * Math.sin(angle)
    // Exact zero axes keep inspector values and bounds free from trig residues.
    if (Math.abs(x2) < 1e-12 * length) x2 = 0
    if (Math.abs(y2) < 1e-12 * length) y2 = 0
  }
  const width = Math.max(1, Math.abs(x2)), height = Math.max(1, Math.abs(y2))
  assertDimensions(start.x, start.y, width, height)
  return { ...template, size: { width, height },
    shapeParams: { ...template.shapeParams, kind, x2, y2 },
    transform: { ...template.transform, x: start.x, y: start.y, scaleX: 1, scaleY: 1,
      rotationDeg: 0, anchorX: x2 / 2, anchorY: y2 / 2 } }
}

/** Scale only converter-owned dimensional parameters; ratios/counts/angles stay authored. */
function resizeParameters(params: ShapeParams | undefined, kind: PlaceableShapeKind,
  radialRatio: number, heightRatio: number): ShapeParams | undefined {
  if (!params) return params
  const result = { ...params }
  if (kind === 'star' || kind === 'ring') {
    if (params.innerRadius !== undefined) result.innerRadius = params.innerRadius * radialRatio
    if (params.outerRadius !== undefined) result.outerRadius = params.outerRadius * radialRatio
  }
  if (kind === 'spiral') {
    if (params.startRadius !== undefined) result.startRadius = params.startRadius * radialRatio
    if (params.endRadius !== undefined) result.endRadius = params.endRadius * radialRatio
  }
  if (kind === 'wave' && params.amplitude !== undefined) result.amplitude = params.amplitude * heightRatio
  return result
}

/** Positive finite dimensions are required by the existing primitive converters. */
function finitePositive(value: number): boolean { return Number.isFinite(value) && value > 0 }

/** Reject subtraction/normalization overflow rather than serializing invalid geometry. */
function assertDimensions(x: number, y: number, width: number, height: number): void {
  if (![x, y, x + width, y + height].every(Number.isFinite) || !finitePositive(width) || !finitePositive(height)) {
    throw new Error('Shape placement dimensions overflowed')
  }
}
