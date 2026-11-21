import { describe, expect, it } from 'vitest'
import { FractureBondGraphCompiler } from '../FractureBondGraphCompiler'
import { FractureClusterComponents } from '../FractureClusterComponents'
import { VoronoiFractureGenerator } from '../VoronoiFractureGenerator'

describe('FractureClusterComponents', () => {
  it('splits only at broken graph edges with canonical identities', () => {
    const generation = new VoronoiFractureGenerator().generate({
      generationId: 'component-generation', sourceOwnerId: 'source',
      sourcePolygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 0, y: 60 }],
      fragmentCount: 4, seed: 42,
    })
    const graph = new FractureBondGraphCompiler().compile(generation, {
      graphId: 'component-graph',
      defaults: { impulseStrength: 1, damageThreshold: 1, damageDecayPerSecond: 0,
        relativeNormalSpeedScale: 1, variation: 0, seed: 1 },
    })
    expect(graph.bonds.length).toBeGreaterThan(0)
    const resolver = new FractureClusterComponents()

    const intact = resolver.resolve(graph, [])
    const split = resolver.resolve(graph, graph.bonds.map(bond => bond.bondId))

    expect(intact).toHaveLength(1)
    expect(intact[0].fragmentIds).toEqual([...graph.fragmentIds])
    expect(split).toHaveLength(graph.fragmentIds.length)
    expect(split.map(component => component.fragmentIds)).toEqual(graph.fragmentIds.map(id => [id]))
    expect(() => resolver.resolve(graph, ['missing'])).toThrow(/unknown/)
  })
})
