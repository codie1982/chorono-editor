import { hashCanonicalRecords } from '@/lib/hash/CanonicalRecordHash'
import type { FractureBondGraph, FractureClusterComponent } from '@/lib/types/fractureCluster'

/**
 * Resolves intact connected components after a deterministic set of bond breaks.
 *
 * The graph is not mutated. Unknown broken ids fail instead of being ignored;
 * component, member and bond ordering is canonical so Worker scheduling cannot
 * change body rebuild identity. Instances retain no mutable state.
 */
export class FractureClusterComponents {
  resolve(graph: FractureBondGraph, brokenBondIds: readonly string[]): readonly FractureClusterComponent[] {
    const knownBonds = new Set(graph.bonds.map(bond => bond.bondId))
    const broken = new Set(brokenBondIds)
    if (broken.size !== brokenBondIds.length || Array.from(broken).some(id => !knownBonds.has(id))) {
      throw new Error('Broken fracture bond ids are duplicated or unknown')
    }
    const neighbors = new Map(graph.fragmentIds.map(id => [id, new Set<string>()]))
    graph.bonds.forEach(bond => {
      if (broken.has(bond.bondId) || bond.initialState === 'broken') return
      neighbors.get(bond.fragmentAId)?.add(bond.fragmentBId)
      neighbors.get(bond.fragmentBId)?.add(bond.fragmentAId)
    })
    const visited = new Set<string>()
    const components: FractureClusterComponent[] = []
    graph.fragmentIds.forEach(rootId => {
      if (visited.has(rootId)) return
      const pending = [rootId]
      const fragmentIds: string[] = []
      visited.add(rootId)
      while (pending.length) {
        const current = pending.shift()!
        fragmentIds.push(current)
        Array.from(neighbors.get(current) ?? []).sort().forEach(neighbor => {
          if (visited.has(neighbor)) return
          visited.add(neighbor)
          pending.push(neighbor)
        })
      }
      fragmentIds.sort()
      const memberIds = new Set(fragmentIds)
      const intactBondIds = graph.bonds.filter(bond => !broken.has(bond.bondId)
        && memberIds.has(bond.fragmentAId) && memberIds.has(bond.fragmentBId))
        .map(bond => bond.bondId).sort()
      components.push(Object.freeze({
        componentId: `${graph.graphId}-component-${hashCanonicalRecords('fracture-component-v1', fragmentIds)}`,
        fragmentIds: Object.freeze(fragmentIds),
        intactBondIds: Object.freeze(intactBondIds),
      }))
    })
    return Object.freeze(components.sort((a, b) => a.fragmentIds[0].localeCompare(b.fragmentIds[0])))
  }
}
