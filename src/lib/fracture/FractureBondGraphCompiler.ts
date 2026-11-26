import { hashCanonicalRecords } from '@/lib/hash/CanonicalRecordHash'
import type {
  AnyFractureGeneration,
  FracturePoint2D,
  FractureRegionRingGeometry,
} from '@/lib/types/fracture'
import type {
  FractureBond,
  FractureBondDefaults,
  FractureBondGraph,
  FractureBondOverride,
} from '@/lib/types/fractureCluster'
import { hashFractureBondGraph } from './FractureBondGraphHash'
import { FractureManifestValidator } from './FractureManifestValidator'
import { FractureRegionManifestValidator } from './FractureRegionManifestValidator'
import { FractureSharedBoundaryAnalyzer } from './FractureSharedBoundaryAnalyzer'

export interface FractureBondGraphCompileInput {
  readonly graphId: string
  readonly defaults: FractureBondDefaults
  readonly overrides?: readonly FractureBondOverride[]
}

/**
 * Compiles deterministic automatic and explicit manual bonds for one generation.
 *
 * Automatic edges require a measured shared boundary. Overrides are keyed by
 * unordered fragment pair; `disabled` removes an automatic edge and `manual`
 * may add a non-adjacent edge whose representative geometry is derived from
 * the two centroids. Seeded variation is materialized into each bond so future
 * runtime versions do not change authored strength. The compiler is stateless.
 */
export class FractureBondGraphCompiler {
  constructor(
    private readonly analyzer = new FractureSharedBoundaryAnalyzer(),
    private readonly manifestValidator = new FractureManifestValidator(),
    private readonly regionManifestValidator = new FractureRegionManifestValidator(),
  ) {}

  compile(generation: AnyFractureGeneration, input: FractureBondGraphCompileInput): FractureBondGraph {
    validateInput(generation, input)
    if (generation.schemaVersion === 1) this.manifestValidator.validate(generation)
    else this.regionManifestValidator.validate(generation)
    const fragments = generation.fragments.map(fragment => fragmentView(generation, fragment.id))
      .sort((a, b) => a.id.localeCompare(b.id))
    const canonicalOverrides = canonicalizeOverrides(input.overrides ?? [])
    const overrides = overrideMap(canonicalOverrides, new Set(fragments.map(fragment => fragment.id)))
    const bonds: FractureBond[] = []
    for (let left = 0; left < fragments.length; left++) {
      for (let right = left + 1; right < fragments.length; right++) {
        const a = fragments[left]
        const b = fragments[right]
        const key = pairKey(a.id, b.id)
        const override = overrides.get(key)
        const metrics = this.analyzer.analyze(a.rings, b.rings, a.centroidPx, b.centroidPx)
        if (override?.mode === 'disabled') {
          if (!metrics) throw new Error('Disabled fracture bond override does not match an automatic bond')
          overrides.delete(key)
          continue
        }
        if (!metrics && override?.mode !== 'manual') continue
        bonds.push(createBond(generation, input, a, b, metrics, override))
        overrides.delete(key)
      }
    }
    if (overrides.size) {
      const unresolved = Array.from(overrides.values()).filter(override => override.mode !== 'disabled')
      if (unresolved.length) throw new Error('Fracture bond override could not be resolved')
    }
    const withoutHash: Omit<FractureBondGraph, 'graphHash'> = {
      schemaVersion: 1,
      graphId: input.graphId,
      generationId: generation.generationId,
      generationTopologyHash: generation.topologyHash,
      compiler: { id: 'shared-boundary-bonds', version: 1 },
      defaults: Object.freeze({ ...input.defaults }),
      overrides: Object.freeze(canonicalOverrides),
      fragmentIds: Object.freeze(fragments.map(fragment => fragment.id)),
      bonds: Object.freeze(bonds.sort((a, b) => a.bondId.localeCompare(b.bondId))),
    }
    return Object.freeze({ ...withoutHash, graphHash: hashFractureBondGraph(withoutHash) })
  }
}

function canonicalizeOverrides(overrides: readonly FractureBondOverride[]): FractureBondOverride[] {
  return overrides.map(override => {
    const [fragmentAId, fragmentBId] = [override.fragmentAId, override.fragmentBId].sort()
    return Object.freeze({ ...override, fragmentAId, fragmentBId })
  }).sort((left, right) => left.fragmentAId.localeCompare(right.fragmentAId)
    || left.fragmentBId.localeCompare(right.fragmentBId))
}

interface FragmentView {
  readonly id: string
  readonly centroidPx: FracturePoint2D
  readonly rings: readonly FractureRegionRingGeometry[]
}

function fragmentView(generation: AnyFractureGeneration, id: string): FragmentView {
  if (generation.schemaVersion === 1) {
    const fragment = generation.fragments.find(candidate => candidate.id === id)
    if (!fragment) throw new Error(`Fracture fragment is missing: ${id}`)
    return { id, centroidPx: fragment.centroidPx, rings: [ring(fragment.polygon)] }
  }
  const fragment = generation.fragments.find(candidate => candidate.id === id)
  if (!fragment) throw new Error(`Fracture fragment is missing: ${id}`)
  return { id, centroidPx: fragment.centroidPx, rings: fragment.boundaryRings }
}

function ring(points: readonly FracturePoint2D[]): FractureRegionRingGeometry {
  return { points, signedDoubleArea: signedDoubleArea(points), parentIndex: null, depth: 0, role: 'outer' }
}

function createBond(
  generation: AnyFractureGeneration,
  input: FractureBondGraphCompileInput,
  a: FragmentView,
  b: FragmentView,
  metrics: ReturnType<FractureSharedBoundaryAnalyzer['analyze']>,
  override?: FractureBondOverride,
): FractureBond {
  const variation = variationMultiplier(input.defaults.seed, a.id, b.id, input.defaults.variation)
  const direction = normalize({ x: b.centroidPx.x - a.centroidPx.x, y: b.centroidPx.y - a.centroidPx.y })
  if (!direction) throw new Error('Fracture bond fragments have coincident centroids')
  const midpoint = metrics?.midpointPx ?? {
    x: (a.centroidPx.x + b.centroidPx.x) / 2,
    y: (a.centroidPx.y + b.centroidPx.y) / 2,
  }
  return Object.freeze({
    bondId: `${input.graphId}-bond-${hashCanonicalRecords('fracture-bond-id-v1', [generation.topologyHash, a.id, b.id])}`,
    fragmentAId: a.id,
    fragmentBId: b.id,
    origin: override?.mode === 'manual' ? 'manual' : 'sharedBoundary',
    sharedBoundaryLengthPx: metrics?.lengthPx ?? 0,
    sharedBoundaryMidpointPx: Object.freeze({ ...midpoint }),
    normalFromAToB: Object.freeze({ ...(metrics?.normalFromLeftToRight ?? direction) }),
    impulseStrength: override?.impulseStrength ?? input.defaults.impulseStrength * variation,
    damageThreshold: override?.damageThreshold ?? input.defaults.damageThreshold * variation,
    damageDecayPerSecond: override?.damageDecayPerSecond ?? input.defaults.damageDecayPerSecond,
    relativeNormalSpeedScale: override?.relativeNormalSpeedScale ?? input.defaults.relativeNormalSpeedScale,
    unbreakable: override?.unbreakable ?? false,
    initialState: 'intact',
  })
}

function overrideMap(
  overrides: readonly FractureBondOverride[],
  fragmentIds: ReadonlySet<string>,
): Map<string, FractureBondOverride> {
  const result = new Map<string, FractureBondOverride>()
  overrides.forEach(override => {
    if (!fragmentIds.has(override.fragmentAId) || !fragmentIds.has(override.fragmentBId)
      || override.fragmentAId === override.fragmentBId) throw new Error('Fracture bond override references an invalid pair')
    const key = pairKey(override.fragmentAId, override.fragmentBId)
    if (result.has(key)) throw new Error('Fracture bond override pair is duplicated')
    validateOverride(override)
    result.set(key, override)
  })
  return result
}

function validateInput(generation: AnyFractureGeneration, input: FractureBondGraphCompileInput): void {
  if (!/^[\w-]{1,96}$/.test(input.graphId)) throw new Error('Fracture bond graph id must be 1-96 portable characters')
  if (!generation.fragments.length) throw new Error('Fracture bond graph requires fragments')
  const values = [input.defaults.impulseStrength, input.defaults.damageThreshold,
    input.defaults.damageDecayPerSecond, input.defaults.relativeNormalSpeedScale, input.defaults.variation]
  if (values.some(value => !Number.isFinite(value)) || input.defaults.impulseStrength <= 0
    || input.defaults.damageThreshold <= 0 || input.defaults.damageDecayPerSecond < 0
    || input.defaults.relativeNormalSpeedScale < 0 || input.defaults.variation < 0
    || input.defaults.variation > 1 || !Number.isSafeInteger(input.defaults.seed)
    || input.defaults.seed < 0 || input.defaults.seed > 0xffffffff) {
    throw new RangeError('Invalid fracture bond defaults')
  }
}

function validateOverride(override: FractureBondOverride): void {
  const positive = [override.impulseStrength, override.damageThreshold]
  const nonNegative = [override.damageDecayPerSecond, override.relativeNormalSpeedScale]
  if (positive.some(value => value !== undefined && (!Number.isFinite(value) || value <= 0))
    || nonNegative.some(value => value !== undefined && (!Number.isFinite(value) || value < 0))) {
    throw new RangeError('Invalid fracture bond override')
  }
}

function variationMultiplier(seed: number, a: string, b: string, amount: number): number {
  const hash = hashCanonicalRecords('fracture-bond-variation-v1', [String(seed), a, b]).slice(0, 8)
  const unit = Number.parseInt(hash, 16) / 0xffffffff
  return 1 + (unit * 2 - 1) * amount
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('\u001f')
}

function signedDoubleArea(points: readonly FracturePoint2D[]): number {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]
    return sum + point.x * next.y - next.x * point.y
  }, 0)
}

function normalize(value: FracturePoint2D): FracturePoint2D | null {
  const length = Math.hypot(value.x, value.y)
  return length <= 1e-7 ? null : { x: value.x / length, y: value.y / length }
}
