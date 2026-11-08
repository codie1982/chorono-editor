import type { ChronoScene, Layer } from '@/lib/types'
import type { OverrideMap } from '@/lib/evaluator'
import type { LayerRelations } from '@/lib/scene/LayerIndex'
import type { LayerRendererPlugin } from '@/lib/registry/LayerRendererRegistry'
import type { EffectRegistry } from '@/lib/effects'
import { gaussianRegionPadding } from '@/lib/effects/effectRegionPadding'
import type { PathBounds } from '@/lib/geometry/computePathBounds'
import { transformBounds, unionBounds } from '@/lib/geometry/boundsMath'
import { createLayerWorldMatrixResolver } from '@/lib/geometry/resolveLayerWorldMatrix'

export interface SurfaceRegionRequest {
  layer: Layer
  scene: ChronoScene
  index: LayerRelations
  overrides: OverrideMap
  timeMs: number
  context: CanvasRenderingContext2D
  find(layer: Layer): LayerRendererPlugin | undefined
  effects: Pick<EffectRegistry, 'get'>
}

/** Plans a conservative integer COMPOSITION-pixel scratch domain, not a viewport
 * crop. Reuses certified native paint bounds, world transforms and child index.
 * No state survives the call; live materialized animation geometry is required.
 * Null always means full-composition fallback, including empty/unknown bounds.
 *
 * Local blur/glow/shadow/tint opt in through their plugin's margin contract.
 * Nested offscreen/temporal/instance content, unknown renderers and global-domain
 * effects stay full-size. Mask extents never shrink the host: subtract, inverted
 * and missing-source semantics are preserved. Feather input gets extra space.
 * Full-rect inverse/gradient effects intentionally have no region capability.
 * Work is bounded to 4096 nodes / 128 levels; no authored data is modified. */
export function planLayerSurfaceRegion(request: SurfaceRegionRequest): PathBounds | null {
  const { layer, scene, context, index, overrides, timeMs, find, effects } = request
  if ((context.filter && context.filter !== 'none')
    || context.globalCompositeOperation !== 'source-over'
    || (context.shadowColor && !['transparent', 'rgba(0, 0, 0, 0)', '#00000000'].includes(context.shadowColor))
    || context.miterLimit < 10 || context.lineWidth < 1) return null
  const parents = new Set<string>()
  let parent: Layer | undefined = layer
  while (parent) {
    if (parents.has(parent.id)) return null
    parents.add(parent.id)
    parent = parent.parentId ? index.get(parent.parentId) : undefined
  }
  let padding = 2
  for (const effect of layer.effectsChain ?? []) {
    if (!effect.enabled) continue
    const margin = effects.get(effect.type)?.regionPadding?.(effect)
    if (margin === undefined || margin === null || !Number.isFinite(margin) || margin < 0) return null
    padding += margin
  }
  const active = new Set<string>()
  const worldMatrix = createLayerWorldMatrixResolver(scene, timeMs, overrides, index)
  let visits = 0
  /** Unions current world-space child paint; unknown is contagious. Root
   * effects/masks are applied by the caller, descendants must be direct paint. */
  const boundsFor = (item: Layer, depth: number, root = false): PathBounds | null => {
    const paint = find(item)?.paint
    if (++visits > 4096 || depth > 128 || active.has(item.id) || !paint?.regionSafe
      || item.instanceOf || item.followPath || item.motionPath
      || (item.motionBlur?.enabled && !item.motionBlur.baked)
      || (item.blendMode && item.blendMode !== 'source-over')
      || (!root && (item.masks?.length || item.effectsChain?.some(effect => effect.enabled)))) return null
    active.add(item.id)
    let bounds: PathBounds | null = null
    if (paint.sceneChildren) {
      for (const child of index.childrenOf(item.id)) {
        if (child.hidden || timeMs < (child.startMs ?? 0) || (child.endMs !== undefined && timeMs > child.endMs)) continue
        const next = boundsFor(child, depth + 1)
        if (!next) { active.delete(item.id); return null }
        bounds = unionBounds(bounds, next)
      }
    } else {
      const local = paint.localBounds?.(item, context)
      if (local) {
        const matrix = worldMatrix(item)
        if (Math.abs(matrix.determinant()) >= 1e-9) bounds = transformBounds(local, matrix)
      }
    }
    active.delete(item.id)
    if (!bounds || !Object.values(bounds).every(Number.isFinite) || bounds.width < 0 || bounds.height < 0) return null
    const blur = item.effects?.blur ?? 0
    if (!Number.isFinite(blur) || blur < 0) return null
    // Native filter is evaluated in the offscreen target. Extra world stretch
    // is conservative for browsers that interpret filter lengths before CTM.
    if (blur) {
      const matrix = worldMatrix(item)
      const stretch = Math.max(1, Math.abs(matrix.a) + Math.abs(matrix.c), Math.abs(matrix.b) + Math.abs(matrix.d))
      const halo = gaussianRegionPadding(blur * stretch)!
      bounds = { x: bounds.x - halo, y: bounds.y - halo, width: bounds.width + 2 * halo, height: bounds.height + 2 * halo }
    }
    return bounds
  }
  const bounds = boundsFor(layer, 0, true)
  if (!bounds) return null
  let featherPadding = 0
  for (const mask of layer.masks ?? []) {
    const target = index.get(mask.maskLayerId)
    if (target && !boundsFor(target, 0)) return null
    const margin = gaussianRegionPadding(mask.feather ?? 0)
    if (margin === null) return null
    featherPadding = Math.max(featherPadding, margin)
  }
  padding += featherPadding
  // Stable allocation buckets avoid resizing two GPU targets at each tiny
  // animated bounds change. Small compositions keep exact integer bounds.
  const quantum = Math.min(scene.composition.width, scene.composition.height) >= 512 ? 128 : 1
  const x = Math.max(0, Math.floor((bounds.x - padding) / quantum) * quantum)
  const y = Math.max(0, Math.floor((bounds.y - padding) / quantum) * quantum)
  const right = Math.min(scene.composition.width, Math.ceil((bounds.x + bounds.width + padding) / quantum) * quantum)
  const bottom = Math.min(scene.composition.height, Math.ceil((bounds.y + bounds.height + padding) / quantum) * quantum)
  const width = right - x, height = bottom - y
  if (![x, y, width, height].every(Number.isSafeInteger) || width <= 0 || height <= 0
    || width * height >= scene.composition.width * scene.composition.height) return null
  return { x, y, width, height }
}
