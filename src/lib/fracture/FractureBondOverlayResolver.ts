import type { OverrideMap } from '@/lib/evaluator'
import { createLayerWorldMatrixResolver } from '@/lib/geometry/resolveLayerWorldMatrix'
import type { ChronoScene } from '@/lib/types'
import type { FracturePoint2D } from '@/lib/types/fracture'
import type { FractureBond } from '@/lib/types/fractureCluster'
import type { RigidFractureBondBreakEvent } from '@/lib/types/physics'
import { FractureClusterComponents } from './FractureClusterComponents'

export interface FractureBondOverlayItem {
  readonly bondId: string
  readonly fragmentAId: string
  readonly fragmentBId: string
  readonly start: FracturePoint2D
  readonly end: FracturePoint2D
  readonly midpoint: FracturePoint2D
  readonly state: 'intact' | 'unbreakable' | 'broken'
  readonly impulseStrength: number
  readonly damageThreshold: number
  readonly breakTimeMs?: number
}

export interface FractureBondOverlayFrame {
  readonly recordId: string
  readonly graphId: string
  readonly bonds: readonly FractureBondOverlayItem[]
  readonly components: readonly {
    readonly componentId: string
    readonly fragmentIds: readonly string[]
  }[]
}

/**
 * Resolves portable bond policy into current editor-only Canvas line geometry.
 *
 * Endpoints follow the exact world matrices of fragment centroids. Before the
 * topology event both endpoints use the source matrix; afterwards each follows
 * its generated fragment. Realized break state is derived from persisted
 * solver events. The resolver never mutates selection or scene data.
 */
export class FractureBondOverlayResolver {
  private readonly componentResolver = new FractureClusterComponents()

  resolve(
    scene: ChronoScene,
    recordId: string | null,
    timeMs: number,
    overrides?: OverrideMap,
  ): FractureBondOverlayFrame | null {
    const records = scene.physics?.rigidBakes ?? []
    const requested = recordId ? records.find(record => record.id === recordId) : undefined
    const record = requested?.recipe.fractureClusters?.length
      ? requested
      : [...records].reverse().find(candidate => candidate.recipe.fractureClusters?.length)
    const cluster = record?.recipe.fractureClusters?.[0]
    const event = record?.recipe.fractureEvents?.find(candidate => candidate.id === cluster?.eventId)
    const generation = scene.physics?.fractureGenerations?.find(candidate => (
      candidate.generationId === cluster?.graph.generationId
    ))
    const source = generation && scene.layers.find(layer => layer.id === generation.source.ownerId)
    if (!record || !cluster || !event || !generation || !source) return null
    const eventTimeMs = record.recipe.startTimeMs + event.timeMs
    const afterEvent = timeMs + 1e-7 >= eventTimeMs
    const layerById = new Map(scene.layers.map(layer => [layer.id, layer]))
    const fragmentById = new Map(generation.fragments.map(fragment => [fragment.id, fragment]))
    const resolveMatrix = createLayerWorldMatrixResolver(scene, timeMs, overrides)
    const realizedBreaks = (record.recipe.fractureBondBreakEvents ?? []).filter(item => (
      record.recipe.startTimeMs + item.timeMs <= timeMs + 1e-7
    ))
    const breaks = new Map(realizedBreaks.map(item => [item.bondId, item]))
    const bonds = cluster.graph.bonds.flatMap(bond => {
      const a = fragmentById.get(bond.fragmentAId)
      const b = fragmentById.get(bond.fragmentBId)
      const layerA = afterEvent ? layerById.get(bond.fragmentAId) : source
      const layerB = afterEvent ? layerById.get(bond.fragmentBId) : source
      if (!a || !b || !layerA || !layerB) return []
      return [toOverlayItem(bond, resolveMatrix(layerA).applyToPoint(a.centroidPx),
        resolveMatrix(layerB).applyToPoint(b.centroidPx), breaks.get(bond.bondId), record.recipe.startTimeMs, timeMs)]
    })
    const components = this.componentResolver.resolve(cluster.graph, realizedBreaks.map(item => item.bondId))
      .map(component => ({ componentId: component.componentId, fragmentIds: component.fragmentIds }))
    return { recordId: record.id, graphId: cluster.graph.graphId, bonds, components }
  }
}

function toOverlayItem(
  bond: FractureBond,
  start: FracturePoint2D,
  end: FracturePoint2D,
  realized: RigidFractureBondBreakEvent | undefined,
  startTimeMs: number,
  frameTimeMs: number,
): FractureBondOverlayItem {
  const breakTimeMs = realized ? startTimeMs + realized.timeMs : undefined
  const broken = breakTimeMs !== undefined && frameTimeMs + 1e-7 >= breakTimeMs
  return {
    bondId: bond.bondId,
    fragmentAId: bond.fragmentAId,
    fragmentBId: bond.fragmentBId,
    start,
    end,
    midpoint: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
    state: broken ? 'broken' : bond.unbreakable ? 'unbreakable' : 'intact',
    impulseStrength: bond.impulseStrength,
    damageThreshold: bond.damageThreshold,
    ...(breakTimeMs !== undefined ? { breakTimeMs } : {}),
  }
}
