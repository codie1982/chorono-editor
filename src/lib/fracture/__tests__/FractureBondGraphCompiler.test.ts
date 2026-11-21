import { describe, expect, it } from 'vitest'
import { VoronoiFractureGenerator } from '../VoronoiFractureGenerator'
import { FractureBondGraphCompiler } from '../FractureBondGraphCompiler'
import { hashFractureBondGraph } from '../FractureBondGraphHash'
import { FractureBondGraphValidator } from '../FractureBondGraphValidator'

const generation = new VoronoiFractureGenerator().generate({
  generationId: 'cluster-generation',
  sourceOwnerId: 'panel',
  sourcePolygon: [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 80 }, { x: 0, y: 80 }],
  fragmentCount: 6,
  seed: 42,
})

const defaults = {
  impulseStrength: 200,
  damageThreshold: 300,
  damageDecayPerSecond: 0,
  relativeNormalSpeedScale: 1,
  variation: 0.15,
  seed: 99,
} as const

describe('FractureBondGraphCompiler', () => {
  it('compiles deterministic shared-boundary bonds and validates ownership', () => {
    const compiler = new FractureBondGraphCompiler()
    const first = compiler.compile(generation, { graphId: 'panel-cluster', defaults })
    const second = compiler.compile(generation, { graphId: 'panel-cluster', defaults })

    expect(second).toEqual(first)
    expect(first.fragmentIds).toEqual([...first.fragmentIds].sort())
    expect(first.bonds.length).toBeGreaterThan(0)
    expect(first.bonds.every(bond => bond.origin === 'sharedBoundary'
      && bond.sharedBoundaryLengthPx > 0
      && Math.abs(Math.hypot(bond.normalFromAToB.x, bond.normalFromAToB.y) - 1) < 1e-8)).toBe(true)
    expect(new Set(first.bonds.map(bond => bond.bondId)).size).toBe(first.bonds.length)
    expect(() => new FractureBondGraphValidator().validate(first, generation)).not.toThrow()
  })

  it('supports disabled, customized and explicit manual pairs', () => {
    const base = new FractureBondGraphCompiler().compile(generation, { graphId: 'base-cluster', defaults })
    const disabled = base.bonds[0]
    const fragmentIds = generation.fragments.map(fragment => fragment.id)
    const bondedPairs = new Set(base.bonds.map(bond => `${bond.fragmentAId}|${bond.fragmentBId}`))
    const manualPair = fragmentIds.flatMap((a, index) => fragmentIds.slice(index + 1).map(b => [a, b] as const))
      .find(([a, b]) => !bondedPairs.has([a, b].sort().join('|')))
    expect(manualPair).toBeDefined()

    const graph = new FractureBondGraphCompiler().compile(generation, {
      graphId: 'overridden-cluster',
      defaults,
      overrides: [
        { fragmentAId: disabled.fragmentAId, fragmentBId: disabled.fragmentBId, mode: 'disabled' },
        { fragmentAId: base.bonds[1].fragmentAId, fragmentBId: base.bonds[1].fragmentBId,
          impulseStrength: 900, unbreakable: true },
        { fragmentAId: manualPair![0], fragmentBId: manualPair![1], mode: 'manual', damageThreshold: 500 },
      ],
    })

    expect(graph.bonds.some(bond => bond.fragmentAId === disabled.fragmentAId
      && bond.fragmentBId === disabled.fragmentBId)).toBe(false)
    expect(graph.bonds).toContainEqual(expect.objectContaining({ impulseStrength: 900, unbreakable: true }))
    expect(graph.bonds).toContainEqual(expect.objectContaining({ origin: 'manual', damageThreshold: 500 }))
  })

  it('rejects duplicate or invalid overrides', () => {
    const bond = new FractureBondGraphCompiler().compile(generation, { graphId: 'base-cluster', defaults }).bonds[0]
    expect(() => new FractureBondGraphCompiler().compile(generation, {
      graphId: 'invalid-cluster', defaults,
      overrides: [
        { fragmentAId: bond.fragmentAId, fragmentBId: bond.fragmentBId },
        { fragmentAId: bond.fragmentBId, fragmentBId: bond.fragmentAId },
      ],
    })).toThrow(/duplicated/)
  })

  it('rejects non-canonical or invalid portable override policy even with a matching hash', () => {
    const validator = new FractureBondGraphValidator()
    const graph = new FractureBondGraphCompiler().compile(generation, {
      graphId: 'portable-cluster',
      defaults,
      overrides: [{
        fragmentAId: generation.fragments[0].id,
        fragmentBId: generation.fragments[1].id,
        mode: 'manual',
      }],
    })
    const invalidWithoutHash = {
      ...graph,
      overrides: graph.overrides.map(override => ({ ...override, damageThreshold: -1 })),
      graphHash: undefined,
    }
    const { graphHash: _ignored, ...portable } = invalidWithoutHash
    const invalid = { ...portable, graphHash: hashFractureBondGraph(portable) }

    expect(() => validator.validatePortable(invalid)).toThrow(/override values/)
  })
})
