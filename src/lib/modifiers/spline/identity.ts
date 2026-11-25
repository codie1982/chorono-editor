import type { SplinePathData } from '../../types/spline'
import { remapSplineRecords, type SplineIdMaps } from '../../spline/topology/remap'
import { canonicalJson, hashCanonicalRecords } from '../../hash/CanonicalRecordHash'

const families = ['points', 'handles', 'segments', 'contours', 'subShapes'] as const
/** Preserve retained source IDs; put new operation output in a deterministic
 * instance-local namespace. Native solvers keep their old random-ID API; this
 * adapter removes allocation-clock dependence from re-evaluation and save/load. */
export function stableModifierSpline(input: SplinePathData, output: SplinePathData, id: string): SplinePathData {
  const used = new Set(families.flatMap(family => Object.keys(input[family])))
  const maps = Object.fromEntries(families.map(family => {
    let index = 0
    return [family, Object.fromEntries(Object.keys(output[family]).map(key => {
      if (input[family][key]) return [key, key]
      let next: string
      do { next = `${id}_${family}_${index++}` } while (used.has(next))
      used.add(next); return [key, next]
    }))]
  })) as SplineIdMaps
  return remapSplineRecords(output, maps)
}
/** Connectivity-only identity for explicit selections. Moving a point keeps
 * identity; changed upstream topology requires reselecting targets. */
export function splineTopologySignature(data: SplinePathData): string {
  return hashCanonicalRecords('modifier-spline-topology-v1', [canonicalJson({
    points: Object.keys(data.points), handles: Object.values(data.handles).map(h => [h.id, h.pointId, h.kind]),
    segments: Object.values(data.segments).map(s => [s.id, s.fromPointId, s.toPointId, s.type]),
    contours: data.contours, subShapes: Object.values(data.subShapes).map(s => [s.id, s.contourIds]),
  })])
}
/** Reject stale scoped selections rather than rebinding an ID to a new corner. */
export function assertModifierTargets(data: SplinePathData, settings: Readonly<Record<string, unknown>>): void {
  if (settings.selectionTopology !== undefined && settings.selectionTopology !== splineTopologySignature(data)) throw new Error('Upstream topology changed. Reselect this modifier’s targets.')
}
