import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FractureBondGraphCompiler } from '@/lib/fracture/FractureBondGraphCompiler'
import { VoronoiFractureGenerator } from '@/lib/fracture/VoronoiFractureGenerator'
import FractureBondAuthoringControls from './FractureBondAuthoringControls'

const generation = new VoronoiFractureGenerator().generate({
  generationId: 'ui-bonds', sourceOwnerId: 'panel', fragmentCount: 5, seed: 5,
  sourcePolygon: [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 80 }, { x: 0, y: 80 }],
})
const graph = new FractureBondGraphCompiler().compile(generation, {
  graphId: 'ui-bond-graph',
  defaults: { impulseStrength: 40, damageThreshold: 80, damageDecayPerSecond: 0,
    relativeNormalSpeedScale: .1, variation: 0, seed: 5 },
})

describe('FractureBondAuthoringControls', () => {
  it('shows pair, per-bond and fixed-tick action controls for a Re-bake graph', () => {
    const html = renderToStaticMarkup(createElement(FractureBondAuthoringControls, {
      graph,
      selectedBondId: graph.bonds[0].bondId,
      currentTimeMs: 500,
      startTimeMs: 100,
      durationMs: 1000,
      stepHz: 120,
      overrides: [],
      forcedBreaks: [{ bondId: graph.bonds[0].bondId, timeMs: 400, source: 'user' }],
      damageResets: [{ timeMs: 450, source: 'timeline' }],
      onSelectBond() {}, onOverrides() {}, onForcedBreaks() {}, onDamageResets() {},
    }))

    expect(html).toContain('Selected bond')
    expect(html).toContain('Bond strength')
    expect(html).toContain('Unbreakable under contact load')
    expect(html).toContain('Split cluster')
    expect(html).toContain('Break at playhead')
    expect(html).toContain('Reset all damage')
    expect(html).toContain('Group selected fragments')
    expect(html).toContain('1 forced break')
    expect(html).toContain('1 damage reset')
  })
})
