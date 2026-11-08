import type { ChronoScene, Layer, ShapeKind, ShapeParams } from '@/lib/types'
import { evaluateTimelines, getLayerValue, type OverrideMap } from '@/lib/evaluator'
import { resolveInstanceLayer } from '@/lib/clone/InstanceResolver'
import { bezierPathToPathDefinition } from '@/lib/path/bezierToPathDefinition'
import { computeSplineBounds } from '@/lib/spline/geometry/computeSplineBounds'
import { measureTextLayout } from '@/lib/text/measureText'
import { resolveTextFontFamily } from '@/lib/text/resolveTextFontFamily'
import { SvgPathParser } from '@/lib/svg/SvgPathParser'
import { computePathBounds, type PathBounds } from './computePathBounds'
import { resolveLayerWorldMatrix } from './resolveLayerWorldMatrix'
import { ShapeToPathConverter } from './ShapeToPathConverter'
import { unionBounds } from './boundsMath'
import type { Matrix2D } from './Matrix2D'
import type { Vec2 } from './CoordinateSystem'
import { materializeRenderScene } from '@/lib/render/materializeOverrides'
import { LayerIndex } from '@/lib/scene/LayerIndex'

export type LayerWorldBoundsResolver = (layer: Layer) => PathBounds | null

/** Optional scheduling policy; the geometric result and memo ownership are
 * unchanged. Callers must keep source/override inputs immutable for the scope. */
export interface LayerWorldBoundsOptions {
  /** Delay evaluation, scene projection and indexing until the first query.
   * Useful for editor frames with no visible bounds consumer. Default false
   * preserves eager callers' preparation/error timing. */
  deferPreparation?: boolean
}

function pointBounds(points: Vec2[]): PathBounds {
  const x = Math.min(...points.map(point => point.x))
  const y = Math.min(...points.map(point => point.y))
  return {
    x, y,
    width: Math.max(...points.map(point => point.x)) - x,
    height: Math.max(...points.map(point => point.y)) - y,
  }
}

function rectangleBounds(width: number, height: number, matrix: Matrix2D, left = 0): PathBounds {
  return pointBounds([
    { x: left, y: 0 }, { x: left + width, y: 0 },
    { x: left, y: height }, { x: left + width, y: height },
  ].map(point => matrix.applyToPoint(point)))
}

/** Canvas renders circles/ellipses as native arcs, so use their analytic
 * transformed extents rather than approximating or rotating their box. */
function ellipseBounds(cx: number, cy: number, rx: number, ry: number, matrix: Matrix2D): PathBounds {
  const center = matrix.applyToPoint({ x: cx, y: cy })
  const xRadius = Math.hypot(matrix.a * rx, matrix.c * ry)
  const yRadius = Math.hypot(matrix.b * rx, matrix.d * ry)
  return { x: center.x - xRadius, y: center.y - yRadius, width: xRadius * 2, height: yRadius * 2 }
}

/** Shared geometry bounds for editor frames, picking aids, rulers and fitting.
 * Resolves live visual instances and parent transforms. Stroke/effect padding
 * is intentionally excluded: this measures the editable geometry itself. */
export function resolveLayerWorldBounds(
  layer: Layer,
  scene: ChronoScene,
  timeMs = 0,
  overrides?: OverrideMap,
): PathBounds | null {
  return createLayerWorldBoundsResolver(scene, timeMs, overrides)(layer)
}

/** Prepare one immutable scene/frame for bulk operations such as marquee
 * selection or drawing many outlines. Coordinates are composition pixels;
 * timeMs is the scene timeline time, and supplied overrides take precedence.
 * Queries memoize bounds by layer ID within this scope, never across edits.
 *
 * With deferPreparation, an unused resolver performs no evaluation, scene
 * materialization or indexing. The first query prepares once through this same
 * implementation; subsequent queries share the ordinary frame memo. Failures
 * propagate at first query and are not cached. Borrowed source/override inputs
 * must remain immutable until the scope is discarded, including before that
 * first query. Default eager behavior remains compatible with existing callers.
 * No native resources, timers or historical frame cache are owned here. */
export function createLayerWorldBoundsResolver(
  scene: ChronoScene,
  timeMs = 0,
  overrides?: OverrideMap,
  options?: LayerWorldBoundsOptions,
): LayerWorldBoundsResolver {
  if (options?.deferPreparation) {
    let prepared: LayerWorldBoundsResolver | undefined
    return layer => (prepared ??= createLayerWorldBoundsResolver(scene, timeMs, overrides))(layer)
  }
  const frame = overrides ?? evaluateTimelines(scene.timelines, timeMs)
  scene = materializeRenderScene(scene, frame)
  const layerIndex = new LayerIndex(scene.layers)
  const memo = new Map<string, PathBounds | null>()
  const active = new Set<string>()

  const hasHiddenOrCyclicAncestor = (item: Layer): boolean => {
    const visited = new Set([item.id])
    let parentId = item.parentId
    while (parentId) {
      if (visited.has(parentId)) return true
      visited.add(parentId)
      const parent = layerIndex.get(parentId)
      if (!parent) break
      if (parent.hidden) return true
      parentId = parent.parentId
    }
    return false
  }

  const compute = (item: Layer): PathBounds | null => {
    if (item.hidden || item.type === 'audio' || active.has(item.id) || hasHiddenOrCyclicAncestor(item)) return null
    const effective = resolveInstanceLayer(item, scene.layers, 0, layerIndex)
    if (!effective || effective.type === 'audio') return null

    if (effective.type === 'group') {
      active.add(item.id)
      let bounds: PathBounds | null = null
      for (const child of layerIndex.childrenOf(item.id)) {
        const childBounds = visit(child)
        if (childBounds) bounds = unionBounds(bounds, childBounds)
      }
      active.delete(item.id)
      return bounds
    }

    const matrix = resolveLayerWorldMatrix(effective, scene, timeMs, frame, layerIndex)
    if (effective.type === 'spline') {
      const data = effective.spline
      if (!data || !Object.values(data.subShapes).some(sub => sub.contourIds.some(id => {
        const contour = data.contours[id]
        return contour && contour.pointIds.length > 0 && !!data.points[contour.pointIds[0]]
      }))) return null
      return computeSplineBounds(data, matrix)
    }
    if (effective.type === 'path') {
      if (!effective.path?.anchors.length) return null
      return computePathBounds(bezierPathToPathDefinition(effective.path), matrix)
    }
    if (effective.type === 'shape') {
      if (!effective.size) return null
      const { width, height } = effective.size
      const kind = effective.shapeKind ?? effective.shape ?? 'rect'
      if (kind === 'circle' || kind === 'ellipse') {
        const rx = kind === 'circle' ? Math.min(width, height) / 2 : width / 2
        const ry = kind === 'circle' ? rx : height / 2
        return ellipseBounds(width / 2, height / 2, rx, ry, matrix)
      }
      // Match the animated geometric fields resolved by drawShape. The pure
      // converter is also the registry's toPath implementation, without an
      // eager dependency on editor/renderer registry bootstrap.
      const params: ShapeParams = { ...effective.shapeParams, kind: kind as ShapeKind }
      for (const key of ['sides', 'innerRadius', 'outerRadius', 'roundness', 'startAngle', 'endAngle'] as const) {
        const value = getLayerValue(frame, effective.id, `shapeParams.${key}`, params[key] ?? NaN)
        if (Number.isNaN(value)) delete params[key]
        else params[key] = value
      }
      const cornerRadius = getLayerValue(frame, effective.id, 'style.cornerRadius', effective.style?.cornerRadius ?? 0)
      return computePathBounds(ShapeToPathConverter.convert(kind, effective.size, params, cornerRadius), matrix)
    }
    if (effective.type === 'pathStroke') {
      const path = effective.pathStroke?.path
      if (!path) return null
      if (path.shapeType === 'custom') {
        const commands = new SvgPathParser().parse(path.customPath ?? '')
        return commands.length ? computePathBounds({ commands, closed: commands.some(command => command.type === 'Z') }, matrix) : null
      }
      const width = path.shapeType === 'circle' || path.shapeType === 'ellipse'
        ? Math.max(2, path.width ?? 100) : Math.max(1, path.width ?? 100)
      const height = path.shapeType === 'circle' ? width
        : path.shapeType === 'ellipse' ? Math.max(2, path.height ?? 100) : Math.max(1, path.height ?? 100)
      return path.shapeType === 'rect' ? rectangleBounds(width, height, matrix)
        : ellipseBounds(width / 2, height / 2, width / 2, height / 2, matrix)
    }
    if (effective.type === 'text') {
      if (!effective.text) return null
      const hasAnimatedSize = ['fontSize', 'letterSpacing', 'value', 'fontFamily', 'fontWeight', 'fontStyle', 'uppercase', 'lineHeight']
        .some(property => frame.has(`layers.${effective.id}.text.${property}`))
      const fontMapped=resolveTextFontFamily(effective.text.fontFamily??'sans-serif',scene.assets)!==(effective.text.fontFamily??'sans-serif')
      const size = !hasAnimatedSize && !fontMapped && effective.size ? effective.size : measureTextLayout({
        ...effective.text,
        fontSize: getLayerValue(frame, effective.id, 'text.fontSize', effective.text.fontSize),
      },scene.assets)
      const left = effective.text.textAlign === 'center' ? -size.width / 2
        : effective.text.textAlign === 'right' ? -size.width : 0
      return rectangleBounds(size.width, size.height, matrix, left)
    }
    if (['image', 'video', 'frameSequence'].includes(effective.type) && effective.size) {
      return rectangleBounds(effective.size.width, effective.size.height, matrix)
    }
    return null
  }

  const visit: LayerWorldBoundsResolver = (item) => {
    if (memo.has(item.id)) return memo.get(item.id)!
    const bounds = compute(layerIndex.get(item.id) ?? item)
    memo.set(item.id, bounds)
    return bounds
  }
  return visit
}
