import type { ChronoScene, Layer } from '@/lib/types'
import { buildEffectsFilter } from '@/lib/types'
import type { LayerRelations } from '@/lib/scene/LayerIndex'
import type { OverrideMap } from '@/lib/evaluator'
import type { LayerRendererPlugin } from '@/lib/registry/LayerRendererRegistry'
import type { PathBounds } from '@/lib/geometry/computePathBounds'
import { Matrix2D } from '@/lib/geometry/Matrix2D'
import { transformBounds, unionBounds } from '@/lib/geometry/boundsMath'
import { boundedContentVersion } from './boundedContentVersion'
import { directPaint } from '../visibility/PaintFrame'

export interface GroupProxyPlan { bounds: PathBounds; drawables: number; ids: string[]; version: string }
interface NodePlan { bounds: PathBounds; drawables: number }

/** Frame-local static-content analysis. No persistent reference/geometry cache.
 * The proxy root may translate as a whole; animated DESCENDANTS, time-hidden
 * members, runtime overrides, instances, bindings and uncertified renderers fail
 * closed. Every candidate is rebuilt from live data (including in-place edits).
 * Only requested groups serialize a bounded exact content version, avoiding hash
 * collisions. Cached children are never removed from the scene or source index.
 */
export class StaticGroupPlan {
  private animated = new Set<string>()
  private linearAnimated = new Set<string>()
  private translationAnimated = new Set<string>()
  private overridden = new Set<string>()
  private protected = new Set<string>()
  private instances = new Set<string>()
  private nodes = new Map<string, NodePlan | null>()
  private active = new Set<string>()

  constructor(source: ChronoScene, private index: LayerRelations, overrides: OverrideMap,
    private timeMs: number, selected: Iterable<string>,
    private find: (layer: Layer) => LayerRendererPlugin | undefined) {
    for (const timeline of source.timelines) for (const track of timeline.tracks) {
      const match = /^layers\.([^.]+)\./.exec(track.target)
      if (match) {
        this.animated.add(match[1])
        this.classifyTransform(track.target, match[1])
      }
    }
    overrides.forEach((_, key) => { const match = /^layers\.([^.]+)\./.exec(key); if (match) { this.overridden.add(match[1]); this.classifyTransform(key, match[1]) } })
    for (const layer of source.layers) if (layer.instanceOf) this.instances.add(layer.id)
    for (const id of Array.from(selected)) {
      let item = index.get(id)
      while (item && !this.protected.has(item.id)) {
        this.protected.add(item.id); item = item.parentId ? index.get(item.parentId) : undefined
      }
    }
  }

  /** Returns conservative GROUP-LOCAL paint bounds and an exact content version.
   * Root placement/opacity are excluded here: the adapter versions the exact
   * backing projection separately and requires outer effective alpha one.
   * UTF-16 version storage is charged to the cache's admission budget. */
  get(group: Layer, context: CanvasRenderingContext2D): GroupProxyPlan | null {
    if (group.type !== 'group' || !this.safe(group)) return null
    const combined = this.children(group, context)
    if (!combined || combined.drawables < 4) return null
    const ids: string[] = [], content: Layer[] = [], stack = [...this.index.childrenOf(group.id)]
    while (stack.length) {
      const item = stack.pop()!
      ids.push(item.id); content.push(item)
      if (ids.length > 4096) return null
      stack.push(...this.index.childrenOf(item.id))
    }
    const version = boundedContentVersion([context.lineWidth, context.miterLimit, context.lineCap, context.lineJoin,
      context.lineDashOffset, context.getLineDash?.() ?? [], content], 262144)
    // Bound work/key size in addition to byte admission; unusually dense groups
    // remain live rather than producing a long-lived unbounded version string.
    if (version === null) return null
    return { ...combined, ids, version }
  }

  /** Moving linear transforms force repeated re-rasterization. Translation-only
   * animations may reuse integer pixel shifts; fractional moving phases stay live.
   * Static fractional/rotated placements are cacheable by projected pixel version. */
  allowsProjection(group: Layer, matrix: { e: number; f: number }): boolean {
    let item: Layer | undefined = group
    const visited = new Set<string>()
    let moving = false
    while (item) {
      if (visited.has(item.id) || this.linearAnimated.has(item.id) || item.motionPath || item.followPath) return false
      visited.add(item.id); moving ||= this.translationAnimated.has(item.id)
      item = item.parentId ? this.index.get(item.parentId) : undefined
    }
    return !moving || (Number.isInteger(matrix.e) && Number.isInteger(matrix.f))
  }

  /** Tracks declared/runtime transform dependencies without evaluating them twice. */
  private classifyTransform(target: string, id: string): void {
    const property = target.slice(`layers.${id}.`.length)
    if (property === 'transform' || /^transform\.(scaleX|scaleY|rotationDeg|anchorX|anchorY)$/.test(property)) this.linearAnimated.add(id)
    if (property === 'transform' || /^transform\.(x|y)$/.test(property)) this.translationAnimated.add(id)
  }

  /** Rejects all context-sensitive/temporal dependencies not covered by v1. */
  private safe(layer: Layer): boolean {
    const capability = this.find(layer)?.paint?.staticRasterSafe
    const safe = typeof capability === 'function' ? capability(layer) : capability
    return !!safe && directPaint(layer)
      && buildEffectsFilter(layer.effects) === 'none' && !this.protected.has(layer.id)
      && !this.instances.has(layer.id) && !layer.followPath && !layer.motionPath
      && !layer.hidden && this.timeMs >= (layer.startMs ?? 0)
      && (layer.endMs === undefined || this.timeMs <= layer.endMs)
      && !Object.keys(layer.paramBindings ?? {}).length && !layer.draggable
      && !(layer.type === 'path' && layer.pathRole === 'motion')
  }

  /** Memoized descendant calculation; current transforms are local, unanimated
   * and finite. Cyclic/missing/unknown geometry never becomes a clipping guess. */
  private node(layer: Layer, context: CanvasRenderingContext2D): NodePlan | null {
    if (this.nodes.has(layer.id)) return this.nodes.get(layer.id)!
    if (this.active.has(layer.id)) return null
    let result: NodePlan | null = null
    if (this.safe(layer) && !this.animated.has(layer.id) && !this.overridden.has(layer.id)) {
      this.active.add(layer.id)
      if (layer.type === 'group') result = this.children(layer, context)
      else {
        const bounds = this.find(layer)?.paint?.localBounds?.(layer, context)
        if (bounds) result = { bounds, drawables: 1 }
      }
      this.active.delete(layer.id)
    }
    this.nodes.set(layer.id, result)
    return result
  }

  /** Ordered union of child paint bounds; inherited alpha is baked per leaf,
   * preserving ordinary non-isolated group semantics at outer alpha one. */
  private children(group: Layer, context: CanvasRenderingContext2D): NodePlan | null {
    let bounds: PathBounds | null = null, drawables = 0
    for (const child of this.index.childrenOf(group.id)) {
      const plan = this.node(child, context)
      if (!plan) return null
      const t = child.transform
      if (!Object.values(t).every(Number.isFinite)) return null
      const matrix = Matrix2D.identity().translate(t.x + t.anchorX, t.y + t.anchorY)
        .rotate(t.rotationDeg).scale(t.scaleX, t.scaleY).translate(-t.anchorX, -t.anchorY)
      bounds = unionBounds(bounds, transformBounds(plan.bounds, matrix))
      drawables += plan.drawables
    }
    return bounds ? { bounds, drawables } : null
  }
}
