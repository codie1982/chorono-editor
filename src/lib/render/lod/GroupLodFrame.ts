import type { ChronoScene, Layer } from '@/lib/types'
import type { OverrideMap } from '@/lib/evaluator'
import type { LayerRelations } from '@/lib/scene/LayerIndex'
import type { LayerRendererRegistry } from '@/lib/registry/LayerRendererRegistry'
import type { PathBounds } from '@/lib/geometry/computePathBounds'
import { transformBounds } from '@/lib/geometry/boundsMath'
import type { PaintFrame } from '../visibility/PaintFrame'
import { StaticGroupPlan } from './StaticGroupPlan'
import type { StaticGroupLodCache } from './StaticGroupLodCache'

/** Explicit viewport-only opt-in. Export/ghost callers omit this option. Zoom
 * is CSS pixels per backing pixel, not composition zoom or output resolution. */
export interface GroupLodOptions { zoom: number }

/** Frame-local static proxy orchestration, separate from traversal/ownership.
 * Enters at <=0.65 screen pixels/local unit, exits above 0.85 (hysteresis).
 * Proxies are rasterized in actual BACKING coordinates, preserving native pixel
 * phase under static rotation/shear. Integer translation reuses them; animated
 * linear/fractional phases stay live. Only viewport opts in. Outer alpha must be
 * one so non-isolated overlapping children preserve their alpha semantics.
 */
export class GroupLodFrame {
  private plan: StaticGroupPlan | null = null
  constructor(source: ChronoScene, index: LayerRelations, overrides: OverrideMap,
    timeMs: number, selected: Iterable<string>, private registry: LayerRendererRegistry,
    private cache: StaticGroupLodCache, private options: GroupLodOptions,
    private viewport: PathBounds, private paint: PaintFrame) {
    cache.beginScene(source)
    if (!Number.isFinite(options.zoom) || options.zoom <= 0 || options.zoom > 0.85) {
      cache.clear(); return
    }
    // A single animated camera/root linear transform disqualifies every normal
    // descendant by the same projection rule below. Avoid rebuilding a complete
    // per-layer dynamics index each frame when no proxy can possibly be used.
    const root = index.roots.length === 1 ? index.roots[0] : undefined
    if (root?.type === 'group') {
      const targets = new Set(['scaleX', 'scaleY', 'rotationDeg', 'anchorX', 'anchorY']
        .map(property => `layers.${root.id}.transform.${property}`))
      if (root.motionPath || root.followPath || source.timelines.some(t => t.tracks.some(track => targets.has(track.target)))) {
        cache.clear(); return
      }
    }
    this.plan = new StaticGroupPlan(source, index, overrides, timeMs, selected, layer => registry.find(layer))
  }

  /** Consumes a synchronous private-paint callback only on an admitted miss.
   * The callback receives the group’s exact projected transform, no main-frame culling or LOD.
   * False leaves ordinary vector drawing responsible for the output. All context
   * state is restored, and cache allocation failure never drops visible content. */
  draw(layer: Layer, context: CanvasRenderingContext2D,
    render: (target: CanvasRenderingContext2D) => void, remainingVisits = Infinity): boolean {
    if (!this.plan || layer.type !== 'group' || context.globalAlpha !== 1
      || context.filter !== 'none' || context.globalCompositeOperation !== 'source-over'
      || !['transparent', 'rgba(0, 0, 0, 0)', '#00000000'].includes(context.shadowColor)
      || typeof context.getTransform !== 'function') return false
    const matrix = context.getTransform()
    const { a, b, c, d } = matrix
    // Largest singular value: conservative even for nested nonuniform scales
    // producing shear. Translation/rotation alone never invalidate local pixels.
    const first = a * a + b * b, second = c * c + d * d, cross = a * c + b * d
    const stretch = Math.sqrt((first + second + Math.hypot(first - second, 2 * cross)) / 2)
    const screenScale = stretch * this.options.zoom
    const limit = this.cache.has(layer.id) ? 0.85 : 0.65
    if (!Number.isFinite(screenScale) || screenScale <= 0 || screenScale > limit) {
      this.cache.invalidate(layer.id); return false
    }
    if (!this.plan.allowsProjection(layer, matrix)) { this.cache.invalidate(layer.id); return false }
    const plan = this.plan.get(layer, context)
    if (!plan) { this.cache.invalidate(layer.id); return false }
    const rect = transformBounds(plan.bounds, matrix), view = this.viewport
    if (!Object.values(rect).every(Number.isFinite) || rect.x + rect.width < view.x - 2
      || rect.y + rect.height < view.y - 2 || rect.x > view.x + view.width + 2
      || rect.y > view.y + view.height + 2) return false
    const x = Math.floor(rect.x) - 2, y = Math.floor(rect.y) - 2
    const width = Math.ceil(rect.x + rect.width) + 2 - x
    const height = Math.ceil(rect.y + rect.height) + 2 - y
    const version = JSON.stringify([this.registry.getRevision(), a, b, c, d, matrix.e - x, matrix.f - y, width, height]) + ':' + plan.version
    const result = this.cache.acquire(layer.id, version, width, height, target => {
      target.setTransform(a, b, c, d, matrix.e - x, matrix.f - y)
      target.lineWidth = context.lineWidth; target.miterLimit = context.miterLimit
      target.lineCap = context.lineCap; target.lineJoin = context.lineJoin
      target.setLineDash(context.getLineDash()); target.lineDashOffset = context.lineDashOffset
      render(target)
    }, plan.ids.length <= remainingVisits)
    if (!result) return false
    try {
      context.save()
      try {
        context.setTransform(1, 0, 0, 1, 0, 0)
        context.imageSmoothingEnabled = false
        context.drawImage(result.canvas, x, y)
      } finally { context.restore() }
    } finally { result.release() }
    this.paint.represent(plan.ids, result.created, plan.drawables)
    return true
  }
}
