import type { ChronoScene, Layer } from '../../types'
import type { OverrideMap } from '../../evaluator'
import { LayerIndex } from '../../scene/LayerIndex'
import { Matrix2D } from '../../geometry/Matrix2D'
import { createLayerWorldBoundsResolver } from '../../geometry/resolveLayerWorldBounds'
import { createLayerWorldMatrixResolver } from '../../geometry/resolveLayerWorldMatrix'
import { unionBounds } from '../../geometry/boundsMath'
import type { PathBounds } from '../../geometry/computePathBounds'

export interface GroupPlacementOptions {
  /** Composition milliseconds at creation; defaults to the authored zero frame. */
  timeMs?: number
  /** Borrowed evaluated overrides from that exact scene/time. */
  overrides?: OverrideMap
}

/** Locate a sibling group's pivot at the union geometry center in composition
 * pixels, then convert that point to the common parent's coordinates. Hidden
 * selected geometry is included through a private visibility projection; source
 * and tracks are never rewritten. Empty/nonvisual selections fall back to the
 * selected origins' bounding center. A singular parent cannot be inverted and
 * rejects preparation. The returned point is a pivot, not a new translation:
 * an identity group with this anchor leaves all child animation unchanged.
 */
export function groupSelectionPivot(scene: ChronoScene, roots: readonly Layer[], options: GroupPlacementOptions = {}): { x: number; y: number } {
  const timeMs = options.timeMs ?? 0
  if (!Number.isFinite(timeMs)) throw new Error('Group creation time must be finite.')
  const index = new LayerIndex(scene.layers)
  const world = createLayerWorldMatrixResolver(scene, timeMs, options.overrides, index)
  const geometryScene = scene.layers.some(layer => layer.hidden) ? {
    ...scene, layers: scene.layers.map(layer => layer.hidden ? { ...layer, hidden: false } : layer),
  } : scene
  const measure = createLayerWorldBoundsResolver(geometryScene, timeMs, options.overrides)
  let bounds: PathBounds | null = null
  for (const layer of roots) {
    const measured = measure(layer)
    if (measured) bounds = unionBounds(bounds, measured)
    else {
      const origin = world(layer).applyToPoint({ x: layer.transform.anchorX, y: layer.transform.anchorY })
      bounds = unionBounds(bounds, { ...origin, width: 0, height: 0 })
    }
  }
  const center = bounds ? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 } : { x: 0, y: 0 }
  const parent = roots[0]?.parentId ? index.get(roots[0].parentId) : undefined
  const parentWorld = parent ? world(parent) : Matrix2D.identity()
  if (Math.abs(parentWorld.determinant()) < 1e-9) throw new Error('Cannot center a group under a singular parent.')
  return parentWorld.invert().applyToPoint(center)
}
