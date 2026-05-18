import { describe, it, expect } from 'vitest'
import {
  arraySettingsToRepeaterData,
  makeConvertToRepeaterCmd,
  makeBakeRepeaterCmd,
} from '../commands-repeater'
import {
  defaultLinearArraySettings,
  defaultRadialArraySettings,
  defaultGridArraySettings,
} from '../../array/ArrayTypes'
import type { ChronoScene, Layer } from '../../types'

function makeRect(id: string = 'rect'): Layer {
  return {
    id,
    name: id,
    type: 'shape',
    shape: 'rect',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 },
    opacity: 1,
    size: { width: 40, height: 40 },
  }
}

function makeScene(layers: Layer[]): ChronoScene {
  return {
    formatVersion: '1.0.0',
    composition: { id: 'c', width: 800, height: 600, durationMs: 5000, frameRate: 60, backgroundColor: '#000' } as any,
    assets: [], layers, timelines: [],
    parameters: [], triggers: [], bindings: [],
    initialState: {},
  } as any
}

describe('arraySettingsToRepeaterData', () => {
  it('converts Linear array → linear RepeaterLayerData', () => {
    const src = makeRect()
    const settings = { ...defaultLinearArraySettings(), count: 4, move: { x: 30, y: 0 } }
    const data = arraySettingsToRepeaterData(src, settings)
    expect(data?.mode).toBe('linear')
    expect(data?.count).toBe(4)
    expect(data?.transformStep?.x).toBe(30)
    expect(data?.sourceLayerId).toBe(src.id)
  })

  it('converts Radial array → polar RepeaterLayerData', () => {
    const src = makeRect()
    const settings = { ...defaultRadialArraySettings(), count: 6, radius: 80 }
    const data = arraySettingsToRepeaterData(src, settings)
    expect(data?.mode).toBe('polar')
    expect(data?.polar?.radius).toBe(80)
  })

  it('returns null for Grid (not renderer-supported)', () => {
    const src = makeRect()
    const settings = defaultGridArraySettings()
    expect(arraySettingsToRepeaterData(src, settings)).toBeNull()
  })
})

describe('makeConvertToRepeaterCmd', () => {
  it('adds a repeater wrapper layer + hides the source', () => {
    const src = makeRect()
    const scene = makeScene([src])
    const cmd = makeConvertToRepeaterCmd({
      source: src,
      settings: { ...defaultLinearArraySettings(), count: 5 },
    })
    expect(cmd).not.toBeNull()
    const after = cmd!.execute(scene)
    expect(after.layers.length).toBe(2)
    const repeater = after.layers.find((l) => l.type === 'repeater')
    expect(repeater?.repeater?.count).toBe(5)
    const source = after.layers.find((l) => l.id === src.id)
    expect(source?.hidden).toBe(true)
  })

  it('undo removes the repeater + unhides source', () => {
    const src = makeRect()
    const scene = makeScene([src])
    const cmd = makeConvertToRepeaterCmd({
      source: src,
      settings: { ...defaultLinearArraySettings(), count: 5 },
    })
    const after = cmd!.execute(scene)
    const back = cmd!.undo(after)
    expect(back.layers.length).toBe(1)
    expect(back.layers[0].hidden).toBeFalsy()
  })

  it('returns null for unsupported (Grid) patterns', () => {
    const src = makeRect()
    const cmd = makeConvertToRepeaterCmd({
      source: src,
      settings: defaultGridArraySettings(),
    })
    expect(cmd).toBeNull()
  })
})

describe('makeBakeRepeaterCmd', () => {
  it('expands a Linear repeater into N baked layers + restores source', () => {
    const src = makeRect()
    const scene0 = makeScene([src])
    const convert = makeConvertToRepeaterCmd({
      source: src,
      settings: { ...defaultLinearArraySettings(), count: 4, move: { x: 30, y: 0 } },
    })!
    const scene1 = convert.execute(scene0)

    const repeater = scene1.layers.find((l) => l.type === 'repeater')!
    const hiddenSrc = scene1.layers.find((l) => l.id === src.id)!

    const bake = makeBakeRepeaterCmd(repeater, hiddenSrc)
    expect(bake).not.toBeNull()
    const scene2 = bake!.execute(scene1)

    // Repeater gone, source visible again, 4 new baked layers.
    expect(scene2.layers.find((l) => l.id === repeater.id)).toBeUndefined()
    expect(scene2.layers.find((l) => l.id === src.id)?.hidden).toBeFalsy()
    const baked = scene2.layers.filter((l) => l.name.startsWith('rect Bake'))
    expect(baked.length).toBe(4)
  })
})
