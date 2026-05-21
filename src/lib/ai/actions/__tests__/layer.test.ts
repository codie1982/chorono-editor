// ── add_layer repeater build tests ────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { buildLayerFromParams } from '../layer'

describe('buildLayerFromParams — repeater', () => {
  it('builds a linear repeater with a transform step', () => {
    const layer = buildLayerFromParams({
      id: 'rep1', name: 'Row', type: 'repeater',
      sourceLayerId: 'card', count: 5, repeaterMode: 'linear',
      stepX: 120, stepOpacity: -0.1,
    })
    expect(layer.type).toBe('repeater')
    expect(layer.repeater?.sourceLayerId).toBe('card')
    expect(layer.repeater?.count).toBe(5)
    expect(layer.repeater?.mode).toBe('linear')
    expect(layer.repeater?.transformStep).toEqual({ x: 120, opacity: -0.1 })
    expect(layer.repeater?.polar).toBeUndefined()
  })

  it('builds a polar repeater with ring params', () => {
    const layer = buildLayerFromParams({
      id: 'rep2', name: 'Ring', type: 'repeater',
      sourceLayerId: 'dot', count: 8, repeaterMode: 'polar',
      polarRadius: 150, polarStartAngle: 0, polarEndAngle: 360,
    })
    expect(layer.repeater?.mode).toBe('polar')
    expect(layer.repeater?.polar).toEqual({ radius: 150, startAngle: 0, endAngle: 360 })
  })

  it('defaults count to 3 and mode to linear', () => {
    const layer = buildLayerFromParams({
      id: 'rep3', name: 'R', type: 'repeater', sourceLayerId: 'x',
    })
    expect(layer.repeater?.count).toBe(3)
    expect(layer.repeater?.mode).toBe('linear')
  })
})
