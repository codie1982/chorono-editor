import type { ChronoScene } from '@/lib/types'
import type { LayerWorldBoundsResolver } from '@/lib/geometry/resolveLayerWorldBounds'
import type { PathBounds } from '@/lib/geometry/computePathBounds'
import { Bounds } from '@/lib/geometry/Bounds'
import { LayerIndex } from '@/lib/scene/LayerIndex'

export interface OffArtboardOutline {
  readonly id: string
  readonly name: string
  readonly bounds: Readonly<PathBounds>
  readonly selected: boolean
}

export interface OffArtboardOutlinePlan {
  readonly outlines: readonly OffArtboardOutline[]
  readonly truncated: boolean
  readonly diagnostics: readonly string[]
  readonly queriedLayers: number
}

export const OFF_ARTBOARD_LIMITS = Object.freeze({ queries: 512, outlines: 256 })

/** Whether finite geometry bounds extend beyond any composition edge. Bounds
 * and composition use the same pixel space; exact edge contact remains inside,
 * with no stroke/effect padding or tolerance. Invalid/negative extents and an
 * invalid composition return false rather than requesting an unusable outline.
 * This pure policy is shared by outside proxies and selected-frame styling. */
export function isOffArtboardBounds(bounds: Readonly<PathBounds>, composition: { width: number; height: number }): boolean {
  const right = bounds.x + bounds.width, bottom = bounds.y + bounds.height
  if (![bounds.x, bounds.y, bounds.width, bounds.height, right, bottom, composition.width, composition.height].every(Number.isFinite)
      || bounds.width < 0 || bounds.height < 0 || composition.width <= 0 || composition.height <= 0) return false
  return bounds.x < 0 || bounds.y < 0 || right > composition.width || bottom > composition.height
}

/** Prepare bounded editor-only geometry bounds outside the composition. The
 * existing frame resolver owns live animation, parent, group, instance and font
 * semantics; bounds here are conservative AABB proxies, not painted contours.
 * All positions use composition pixels. Stroke/effect padding is excluded.
 *
 * Selected IDs are considered first, then unselected top-level roots from the
 * top of the authored stack. A group is represented once rather than exposing
 * every child as a competing hit target. Explicitly selected descendants remain
 * accessible. Roots entirely inside the artboard or outside the visible work
 * area are omitted; partially outside bounds remain whole for correct clipping.
 * Up to 512 resolver queries and 256 outlines are admitted per immutable frame;
 * large scenes report a limit instead of retaining an unbounded runtime cache.
 * This cap limits resolver calls, not recursive work inside an existing group
 * bounds query. Layer-list selection remains available for omitted objects.
 * No layer, transform, key, asset, history or render resource is mutated.
 */
export function prepareOffArtboardOutlines(scene: ChronoScene, selectedIds: ReadonlySet<string>,
  boundsFor: LayerWorldBoundsResolver, composition: { width: number; height: number },
  viewport: PathBounds): OffArtboardOutlinePlan {
  if (![composition.width, composition.height, viewport.x, viewport.y, viewport.width, viewport.height].every(Number.isFinite)
      || composition.width <= 0 || composition.height <= 0 || viewport.width <= 0 || viewport.height <= 0) {
    return { outlines: [], queriedLayers: 0, truncated: false, diagnostics: ['The work area has no finite visible bounds.'] }
  }
  const index = new LayerIndex(scene.layers), candidates = Array.from(selectedIds)
  const seen = new Set(candidates)
  for (let i = index.roots.length - 1; i >= 0; i--) {
    const root = index.roots[i]
    if (!seen.has(root.id)) { seen.add(root.id); candidates.push(root.id) }
  }
  const view = new Bounds(viewport.x, viewport.y, viewport.width, viewport.height)
  const outlines: OffArtboardOutline[] = []
  let queriedLayers = 0, truncated = false, unavailable = 0
  for (const id of candidates) {
    const layer = index.get(id)
    if (!layer || layer.hidden || layer.type === 'audio') continue
    if (queriedLayers >= OFF_ARTBOARD_LIMITS.queries || outlines.length >= OFF_ARTBOARD_LIMITS.outlines) { truncated = true; break }
    queriedLayers++
    let bounds: PathBounds | null
    try { bounds = boundsFor(layer) } catch { unavailable++; continue }
    if (!bounds || !isOffArtboardBounds(bounds, composition)) continue
    if (!view.intersects(new Bounds(bounds.x, bounds.y, bounds.width, bounds.height))) continue
    outlines.push({ id, name: layer.name, bounds: Object.freeze({ ...bounds }), selected: selectedIds.has(id) })
  }
  const diagnostics = truncated ? ['Off-artboard outline preview is limited. Select a layer in Layers to prioritize its outline.'] : []
  if (unavailable) diagnostics.push(`${unavailable} off-artboard outline geometry queries were unavailable. Select those layers in Layers to inspect them.`)
  return { outlines, truncated, queriedLayers, diagnostics }
}
