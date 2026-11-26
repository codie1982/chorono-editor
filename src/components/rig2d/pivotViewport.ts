import type { ChronoScene, Layer } from '@/lib/types'
import type { OverrideMap } from '@/lib/evaluator'
import { createLayerWorldMatrixResolver } from '@/lib/geometry/resolveLayerWorldMatrix'
import { materializeRenderScene } from '@/lib/render/materializeOverrides'
import { LayerDrawVisibility } from '@/lib/render/visibility/LayerDrawVisibility'
import { LayerIndex } from '@/lib/scene/LayerIndex'
import { hasInvalidPivotLink } from '@/lib/rig2d/frame'

export interface PivotRelation { from: string; to: string; kind: 'link' | 'ik' }

/** Hit the center of a rendered target crosshair in client CSS pixels.
 * Reading the symmetric marker's box on pointer-down follows pan, zoom and
 * frame visibility exactly, including an empty group with no painted body.
 * Only the central five pixels of radius take precedence over resize handles. */
export function hitIKTargetMarker(artboard: HTMLElement, x: number, y: number): string | undefined {
  for (const marker of Array.from(artboard.querySelectorAll<SVGGElement>('[data-ik-target]')).reverse()) {
    const rect = marker.getBoundingClientRect()
    if (rect.width && Math.hypot(x - rect.left - rect.width / 2, y - rect.top - rect.height / 2) <= 5)
      return marker.dataset.ikTarget
  }
}

/** Show incoming and outgoing links of the selection. Selecting any joint or
 * target of an IK chain reveals both segments. Keys deduplicate multiselection. */
export function selectedPivotRelations(layers: Layer[], selection: ReadonlySet<string>): PivotRelation[] {
  const relations = new Map<string, PivotRelation>()
  if (!selection.size) return []
  function add(from: string, to: string, kind: PivotRelation['kind']) {
    relations.set(kind + from, { from, to, kind })
  }
  for (const layer of layers) {
    const link = layer.pivotLink2d, ik = layer.twoBoneIK2d
    if (link && (selection.has(layer.id) || selection.has(link.driverId)) && !hasInvalidPivotLink(layers, layer.id))
      add(layer.id, link.driverId, 'link')
    if (ik && [layer.id, ik.lowerId, ik.targetId].some(id => selection.has(id)) && !hasInvalidPivotLink(layers, layer.id)) {
      add(ik.lowerId, layer.id, 'link')
      add(ik.lowerId, ik.targetId, 'ik')
    }
  }
  return Array.from(relations.values())
}

/** Project layer anchors through the same evaluated artwork and ancestor
 * transforms as the renderer. Invisible, isolated or inactive endpoints are
 * omitted. Results are in composition pixels, before viewport zoom and pan. */
export function viewportPivots(scene: ChronoScene, timeMs: number, overrides: OverrideMap) {
  const visual = materializeRenderScene(scene, overrides)
  const index = new LayerIndex(visual.layers)
  const visibility = new LayerDrawVisibility(visual.layers, timeMs, index)
  const matrixFor = createLayerWorldMatrixResolver(visual, timeMs, overrides, index)
  return (id: string) => {
    const item = index.get(id)
    if (!item) return null
    for (const ancestor of Array.from(index.ancestorIds([id]))) {
      const layer = index.get(ancestor)!
      if (!visibility.sceneChild(layer) || layer.opacity <= 0) return null
    }
    return matrixFor(item).applyToPoint({ x: item.transform.anchorX, y: item.transform.anchorY })
  }
}
