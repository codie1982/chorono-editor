import { describe, expect, it } from 'vitest'
import { SimulationClock } from '@/lib/simulation/SimulationClock'
import { FractureBondActionSchedule } from '../FractureBondActionSchedule'
import { FractureBondGraphCompiler } from '../FractureBondGraphCompiler'
import { VoronoiFractureGenerator } from '../VoronoiFractureGenerator'

const generation = new VoronoiFractureGenerator().generate({
  generationId: 'action-generation',
  sourceOwnerId: 'panel',
  sourcePolygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
  fragmentCount: 4,
  seed: 12,
})
const graph = new FractureBondGraphCompiler().compile(generation, {
  graphId: 'action-graph',
  defaults: { impulseStrength: 40, damageThreshold: 80, damageDecayPerSecond: 0,
    relativeNormalSpeedScale: .1, variation: 0, seed: 12 },
})
const clock = new SimulationClock({ durationMs: 1000, stepHz: 100, sampleFps: 20 })

describe('FractureBondActionSchedule', () => {
  it('canonicalizes forced breaks and graph-wide or per-bond damage resets', () => {
    const bonds = graph.bonds.slice(0, 2)
    const result = new FractureBondActionSchedule().compile(graph, clock, {
      forcedBreaks: [
        { bondId: bonds[1].bondId, timeMs: 300, source: 'user' },
        { bondId: bonds[0].bondId, timeMs: 200, source: 'timeline' },
      ],
      damageResets: [
        { timeMs: 400, source: 'user' },
        { bondId: bonds[0].bondId, timeMs: 250, source: 'timeline' },
      ],
    })

    expect(result.forcedBreaks.map(action => action.timeMs)).toEqual([200, 300])
    expect(result.damageResets.map(action => action.timeMs)).toEqual([250, 400])
    expect(Object.isFrozen(result.forcedBreaks)).toBe(true)
  })

  it('rejects unknown bonds, duplicate actions and non-aligned times', () => {
    const compiler = new FractureBondActionSchedule()
    expect(() => compiler.compile(graph, clock, {
      forcedBreaks: [{ bondId: 'missing', timeMs: 200, source: 'user' }],
    })).toThrow(/target/)
    expect(() => compiler.compile(graph, clock, {
      forcedBreaks: [
        { bondId: graph.bonds[0].bondId, timeMs: 200, source: 'user' },
        { bondId: graph.bonds[0].bondId, timeMs: 200, source: 'timeline' },
      ],
    })).toThrow(/duplicated/)
    expect(() => compiler.compile(graph, clock, {
      damageResets: [{ timeMs: 205, source: 'user' }],
    })).toThrow(/fixed-step/)
  })
})
