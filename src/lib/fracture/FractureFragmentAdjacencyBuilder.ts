import type {
  FractureFragmentAdjacency,
  FractureRegionFragmentGeometry,
} from '@/lib/types/fracture'
import { FractureSharedBoundaryAnalyzer } from './FractureSharedBoundaryAnalyzer'

/**
 * Finds shared non-zero boundary segments between FRACTURE1 fragments.
 *
 * All rings use source-local composition pixels. Collinear partial overlaps
 * are measured even when one side subdivides an edge differently. Point-only
 * contact is ignored. Results are detached, sorted by fragment ids and contain
 * one accumulated record per unordered pair. Instances hold no mutable state.
 */
export class FractureFragmentAdjacencyBuilder {
  constructor(private readonly analyzer = new FractureSharedBoundaryAnalyzer()) {}

  build(fragments: readonly FractureRegionFragmentGeometry[]): readonly FractureFragmentAdjacency[] {
    const result: FractureFragmentAdjacency[] = []
    for (let left = 0; left < fragments.length; left++) {
      for (let right = left + 1; right < fragments.length; right++) {
        const metrics = this.analyzer.analyze(
          fragments[left].boundaryRings,
          fragments[right].boundaryRings,
          fragments[left].centroidPx,
          fragments[right].centroidPx,
        )
        if (!metrics) continue
        const [fragmentAId, fragmentBId] = [fragments[left].id, fragments[right].id].sort()
        result.push(Object.freeze({ fragmentAId, fragmentBId, sharedLengthPx: metrics.lengthPx }))
      }
    }
    return Object.freeze(result.sort((a, b) => a.fragmentAId.localeCompare(b.fragmentAId)
      || a.fragmentBId.localeCompare(b.fragmentBId)))
  }
}
