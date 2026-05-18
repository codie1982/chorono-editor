import { describe, it, expect } from 'vitest'
import { makeCloneCmd, makeArrayCmd, duplicateAnimationTracksForIdMap } from './commands-clone'
import { defaultLinearArraySettings, defaultGridArraySettings } from '../array/ArrayTypes'
import type { ChronoScene, Layer, Timeline, Track } from '../types'

function makeRect(id: string = 'rect_1', x: number = 0, y: number = 0): Layer {
  return {
    id,
    name: 'Rect',
    type: 'shape',
    shape: 'rect',
    transform: { x, y, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 },
    opacity: 1,
  }
}

function makeTimeline(tracks: Track[] = []): Timeline {
  return {
    id: 'tl_1',
    durationMs: 5000,
    autoplay: false,
    loop: false,
    tracks,
  }
}

function makeScene(layers: Layer[], timeline?: Timeline): ChronoScene {
  return {
    formatVersion: '1.0.0',
    composition: {
      id: 'c',
      width: 800,
      height: 600,
      durationMs: 5000,
      frameRate: 60,
      backgroundColor: '#000',
    } as any,
    assets: [],
    layers,
    timelines: timeline ? [timeline] : [],
    parameters: [],
    triggers: [],
    bindings: [],
    initialState: {},
  } as any
}

describe('makeCloneCmd', () => {
  it('creates N new layers and they vanish on undo', () => {
    const source = makeRect()
    const scene = makeScene([source])
    const cmd = makeCloneCmd({
      source,
      count: 3,
      timeline: null,
      allLayers: scene.layers,
    })
    const after = cmd.execute(scene)
    expect(after.layers.length).toBe(4) // source + 3 clones
    const back = cmd.undo(after)
    expect(back.layers.length).toBe(1)
    expect(back.layers[0].id).toBe(source.id)
  })

  it('applies incremental offset to each clone', () => {
    const source = makeRect('rect_1', 0, 0)
    const scene = makeScene([source])
    const cmd = makeCloneCmd({
      source,
      count: 3,
      offsetX: 10,
      offsetY: 20,
      timeline: null,
      allLayers: scene.layers,
    })
    const after = cmd.execute(scene)
    const clones = after.layers.slice(1)
    expect(clones.length).toBe(3)
    expect(clones[0].transform.x).toBe(10)
    expect(clones[0].transform.y).toBe(20)
    expect(clones[1].transform.x).toBe(20)
    expect(clones[2].transform.x).toBe(30)
  })

  it('result exposes createdLayerIds and suggestedSelection', () => {
    const source = makeRect()
    const scene = makeScene([source])
    const cmd = makeCloneCmd({
      source,
      count: 2,
      timeline: null,
      allLayers: scene.layers,
    })
    expect(cmd.result.createdLayerIds.length).toBe(2)
    expect(cmd.result.suggestedSelection.length).toBe(2)
  })

  it('duplicates animation tracks when timeline provided', () => {
    const source = makeRect()
    const timeline = makeTimeline([
      {
        target: `layers.${source.id}.opacity`,
        keyframes: [
          { id: 'kf_1', timeMs: 0, value: 1, easing: { type: 'linear' } },
          { id: 'kf_2', timeMs: 1000, value: 0, easing: { type: 'linear' } },
        ],
      },
    ])
    const scene = makeScene([source], timeline)
    const cmd = makeCloneCmd({
      source,
      count: 1,
      timeline,
      allLayers: scene.layers,
    })
    const after = cmd.execute(scene)
    // 1 original track + 1 duplicated for the clone
    expect(after.timelines[0].tracks.length).toBe(2)
    // Cloned track must have fresh kf ids
    const newTrack = after.timelines[0].tracks[1]
    expect(newTrack.keyframes[0].id).not.toBe('kf_1')
    expect(newTrack.keyframes[0].timeMs).toBe(0)
  })
})

describe('makeArrayCmd — Linear', () => {
  it('creates count-1 new clones (include-source policy)', () => {
    const source = makeRect()
    const scene = makeScene([source])
    const settings = {
      ...defaultLinearArraySettings(),
      count: 5,
      move: { x: 50, y: 0 },
    }
    const cmd = makeArrayCmd({
      source,
      settings,
      timeline: null,
      allLayers: scene.layers,
    })
    const after = cmd.execute(scene)
    expect(after.layers.length).toBe(5) // source + 4 clones
    const xs = after.layers.map((l) => l.transform.x).sort((a, b) => a - b)
    expect(xs).toEqual([0, 50, 100, 150, 200])
  })

  it('creates count new clones (clone-source-too policy)', () => {
    const source = makeRect()
    const scene = makeScene([source])
    const settings = {
      ...defaultLinearArraySettings(),
      count: 5,
      sourcePolicy: 'clone-source-too' as const,
    }
    const cmd = makeArrayCmd({
      source,
      settings,
      timeline: null,
      allLayers: scene.layers,
    })
    const after = cmd.execute(scene)
    expect(after.layers.length).toBe(6) // source + 5 clones
  })

  it('undo removes all clones', () => {
    const source = makeRect()
    const scene = makeScene([source])
    const settings = { ...defaultLinearArraySettings(), count: 10 }
    const cmd = makeArrayCmd({
      source,
      settings,
      timeline: null,
      allLayers: scene.layers,
    })
    const after = cmd.execute(scene)
    expect(after.layers.length).toBe(10)
    const back = cmd.undo(after)
    expect(back.layers.length).toBe(1)
  })
})

describe('makeArrayCmd — Grid', () => {
  it('creates columns × rows total layers minus source', () => {
    const source = makeRect()
    const scene = makeScene([source])
    const settings = {
      ...defaultGridArraySettings(),
      columns: 3,
      rows: 2,
      sourcePolicy: 'include-source' as const,
    }
    const cmd = makeArrayCmd({
      source,
      settings,
      timeline: null,
      allLayers: scene.layers,
    })
    const after = cmd.execute(scene)
    // 3*2 = 6 total, source at index 0, so 5 new clones, total 6 layers
    expect(after.layers.length).toBe(6)
  })
})

describe('duplicateAnimationTracksForIdMap', () => {
  it('duplicates tracks matching idMap entries', () => {
    const timeline = makeTimeline([
      {
        target: 'layers.a.opacity',
        keyframes: [{ id: 'k1', timeMs: 0, value: 1, easing: { type: 'linear' } }],
      },
      {
        target: 'layers.b.opacity',
        keyframes: [{ id: 'k2', timeMs: 0, value: 0.5, easing: { type: 'linear' } }],
      },
    ])
    const dup = duplicateAnimationTracksForIdMap(timeline, { a: 'A_new' })
    expect(dup.length).toBe(1)
    expect(dup[0].target).toBe('layers.A_new.opacity')
    expect(dup[0].keyframes[0].id).not.toBe('k1')
  })

  it('applies timeOffsetMs to duplicated keyframes', () => {
    const timeline = makeTimeline([
      {
        target: 'layers.a.opacity',
        keyframes: [
          { id: 'k1', timeMs: 100, value: 1, easing: { type: 'linear' } },
          { id: 'k2', timeMs: 500, value: 0, easing: { type: 'linear' } },
        ],
      },
    ])
    const dup = duplicateAnimationTracksForIdMap(timeline, { a: 'A_new' }, 200)
    expect(dup[0].keyframes[0].timeMs).toBe(300)
    expect(dup[0].keyframes[1].timeMs).toBe(700)
  })

  it('skips non-layer entity types', () => {
    const timeline = makeTimeline([
      {
        target: 'modifiers.x.amount',
        keyframes: [],
      },
    ])
    const dup = duplicateAnimationTracksForIdMap(timeline, { x: 'X_new' })
    expect(dup.length).toBe(0)
  })
})
