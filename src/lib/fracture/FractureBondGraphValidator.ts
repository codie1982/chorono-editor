import { hashCanonicalRecords } from '@/lib/hash/CanonicalRecordHash'
import type { AnyFractureGeneration } from '@/lib/types/fracture'
import type { FractureBondGraph } from '@/lib/types/fractureCluster'
import { hashFractureBondGraph } from './FractureBondGraphHash'

/**
 * Validates a stored bond graph against its immutable fracture generation.
 *
 * Validation checks portable ids, sorted ownership, pair uniqueness, finite
 * policy values, representative geometry and the complete graph hash. It does
 * not recompute authored overrides or runtime damage. Instances are stateless.
 */
export class FractureBondGraphValidator {
  validate(graph: FractureBondGraph, generation: AnyFractureGeneration): void {
    this.validatePortable(graph)
    if (graph.generationId !== generation.generationId
      || graph.generationTopologyHash !== generation.topologyHash) {
      throw new Error('Fracture bond graph generation ownership is stale')
    }
    const expectedIds = generation.fragments.map(fragment => fragment.id).sort()
    if (JSON.stringify(graph.fragmentIds) !== JSON.stringify(expectedIds)) {
      throw new Error('Fracture bond graph fragment ownership is stale')
    }
  }

  /** Validate a detached graph when its owning generation is not embedded. */
  validatePortable(graph: FractureBondGraph): void {
    if (!graph || graph.schemaVersion !== 1 || graph.compiler?.id !== 'shared-boundary-bonds'
      || graph.compiler.version !== 1 || !/^[\w-]{1,96}$/.test(graph.graphId)) {
      throw new Error('Unsupported fracture bond graph schema')
    }
    const defaults = graph.defaults
    const defaultValues = [defaults?.impulseStrength, defaults?.damageThreshold,
      defaults?.damageDecayPerSecond, defaults?.relativeNormalSpeedScale, defaults?.variation]
    if (defaultValues.some(value => !Number.isFinite(value)) || defaults.impulseStrength <= 0
      || defaults.damageThreshold <= 0 || defaults.damageDecayPerSecond < 0
      || defaults.relativeNormalSpeedScale < 0 || defaults.variation < 0 || defaults.variation > 1
      || !Number.isSafeInteger(defaults.seed) || defaults.seed < 0 || defaults.seed > 0xffffffff) {
      throw new Error('Fracture bond graph defaults are invalid')
    }
    const expectedIds = [...graph.fragmentIds].sort()
    if (!graph.fragmentIds.length || JSON.stringify(graph.fragmentIds) !== JSON.stringify(expectedIds)
      || new Set(graph.fragmentIds).size !== graph.fragmentIds.length) throw new Error('Fracture bond graph fragment ownership is invalid')
    const fragmentIds = new Set(graph.fragmentIds)
    if (!Array.isArray(graph.overrides)) throw new Error('Fracture bond graph overrides are invalid')
    const overridePairs = new Set<string>()
    let previousOverrideKey = ''
    graph.overrides.forEach(override => {
      const pair = [override.fragmentAId, override.fragmentBId].sort()
      const key = pair.join('\u001f')
      if (!fragmentIds.has(pair[0]) || !fragmentIds.has(pair[1]) || pair[0] === pair[1]
        || override.fragmentAId !== pair[0] || override.fragmentBId !== pair[1]
        || overridePairs.has(key) || key < previousOverrideKey) {
        throw new Error('Fracture bond graph override identity is invalid')
      }
      if (override.mode !== undefined && !['auto', 'disabled', 'manual'].includes(override.mode)) {
        throw new Error('Fracture bond graph override mode is invalid')
      }
      const positive = [override.impulseStrength, override.damageThreshold]
      const nonNegative = [override.damageDecayPerSecond, override.relativeNormalSpeedScale]
      if (positive.some(value => value !== undefined && (!Number.isFinite(value) || value <= 0))
        || nonNegative.some(value => value !== undefined && (!Number.isFinite(value) || value < 0))
        || (override.unbreakable !== undefined && typeof override.unbreakable !== 'boolean')) {
        throw new Error('Fracture bond graph override values are invalid')
      }
      overridePairs.add(key)
      previousOverrideKey = key
    })
    if (!Array.isArray(graph.bonds)) throw new Error('Fracture bond graph bonds are invalid')
    const pairs = new Set<string>()
    const bondIds = new Set<string>()
    graph.bonds.forEach(bond => {
      const pair = [bond.fragmentAId, bond.fragmentBId].sort()
      const key = pair.join('\u001f')
      if (!fragmentIds.has(bond.fragmentAId) || !fragmentIds.has(bond.fragmentBId)
        || bond.fragmentAId !== pair[0] || bond.fragmentBId !== pair[1]
        || pairs.has(key) || bondIds.has(bond.bondId)) throw new Error('Fracture bond identity is invalid')
      const expectedBondId = `${graph.graphId}-bond-${hashCanonicalRecords('fracture-bond-id-v1', [
        graph.generationTopologyHash, bond.fragmentAId, bond.fragmentBId,
      ])}`
      if (bond.bondId !== expectedBondId) throw new Error('Fracture bond id is stale')
      pairs.add(key)
      bondIds.add(bond.bondId)
      const values = [bond.sharedBoundaryLengthPx, bond.sharedBoundaryMidpointPx.x,
        bond.sharedBoundaryMidpointPx.y, bond.normalFromAToB.x, bond.normalFromAToB.y,
        bond.impulseStrength, bond.damageThreshold, bond.damageDecayPerSecond,
        bond.relativeNormalSpeedScale]
      if (values.some(value => !Number.isFinite(value)) || bond.sharedBoundaryLengthPx < 0
        || (bond.origin === 'sharedBoundary' && bond.sharedBoundaryLengthPx <= 0)
        || bond.impulseStrength <= 0 || bond.damageThreshold <= 0
        || bond.damageDecayPerSecond < 0 || bond.relativeNormalSpeedScale < 0
        || Math.abs(Math.hypot(bond.normalFromAToB.x, bond.normalFromAToB.y) - 1) > 1e-7
        || bond.initialState !== 'intact') throw new Error(`Fracture bond is invalid: ${bond.bondId}`)
    })
    const sortedBondIds = graph.bonds.map(bond => bond.bondId).sort()
    if (JSON.stringify(graph.bonds.map(bond => bond.bondId)) !== JSON.stringify(sortedBondIds)) {
      throw new Error('Fracture bonds are not in canonical order')
    }
    const { graphHash, ...withoutHash } = graph
    if (hashFractureBondGraph(withoutHash) !== graphHash) throw new Error('Fracture bond graph hash is stale')
  }
}
