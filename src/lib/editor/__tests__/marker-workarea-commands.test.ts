import { describe, it, expect } from 'vitest'
import {
  makeAddMarkerCmd, makeDeleteMarkerCmd, makeUpdateMarkerCmd, makeMoveMarkerCmd,
  makeSetWorkAreaCmd,
} from '../commands-timeline'
import type { ChronoScene, TimelineMarker } from '../../types'

function makeScene(markers: TimelineMarker[] = []): ChronoScene {
  return {
    formatVersion: '1.0.0',
    composition: { id: 't', width: 1920, height: 1080, durationMs: 5000, frameRate: 30, backgroundColor: '#000' },
    assets: [],
    layers: [],
    timelines: [
      { id: 'tl1', durationMs: 5000, loop: false, autoplay: false, tracks: [], markers },
    ],
    parameters: [],
    triggers: [],
    bindings: [],
    initialState: {},
  } as unknown as ChronoScene
}

const M = (id: string, timeMs: number, label = 'X', color = '#a78bfa'): TimelineMarker => ({
  id, timeMs, label, color,
})

describe('Marker commands (BL-11)', () => {
  it('makeAddMarkerCmd adds + undo removes', () => {
    const scene = makeScene()
    const marker = M('m1', 1500)
    const cmd = makeAddMarkerCmd('tl1', marker)
    const after = cmd.execute(scene)
    expect(after.timelines[0].markers).toEqual([marker])
    const back = cmd.undo(after)
    expect(back.timelines[0].markers).toEqual([])
  })

  it('makeDeleteMarkerCmd removes + undo restores', () => {
    const marker = M('m1', 1500)
    const scene = makeScene([marker])
    const cmd = makeDeleteMarkerCmd('tl1', marker)
    const after = cmd.execute(scene)
    expect(after.timelines[0].markers).toEqual([])
    const back = cmd.undo(after)
    expect(back.timelines[0].markers).toEqual([marker])
  })

  it('makeUpdateMarkerCmd patches label + color, undo restores', () => {
    const marker = M('m1', 1500, 'old', '#aaaaaa')
    const scene = makeScene([marker])
    const cmd = makeUpdateMarkerCmd('tl1', 'm1',
      { label: 'old', color: '#aaaaaa' },
      { label: 'new', color: '#22d3ee' },
    )
    const after = cmd.execute(scene)
    const m = after.timelines[0].markers![0]
    expect(m.label).toBe('new')
    expect(m.color).toBe('#22d3ee')
    expect(m.timeMs).toBe(1500) // unchanged
    const back = cmd.undo(after)
    expect(back.timelines[0].markers![0].label).toBe('old')
    expect(back.timelines[0].markers![0].color).toBe('#aaaaaa')
  })

  it('makeMoveMarkerCmd shifts timeMs, undo restores', () => {
    const marker = M('m1', 1500)
    const scene = makeScene([marker])
    const cmd = makeMoveMarkerCmd('tl1', 'm1', 1500, 2500)
    const after = cmd.execute(scene)
    expect(after.timelines[0].markers![0].timeMs).toBe(2500)
    expect(after.timelines[0].markers![0].label).toBe('X') // unchanged
    const back = cmd.undo(after)
    expect(back.timelines[0].markers![0].timeMs).toBe(1500)
  })

  it('marker commands leave other markers untouched', () => {
    const m1 = M('m1', 1000)
    const m2 = M('m2', 2000)
    const m3 = M('m3', 3000)
    const scene = makeScene([m1, m2, m3])
    const cmd = makeMoveMarkerCmd('tl1', 'm2', 2000, 2500)
    const after = cmd.execute(scene)
    const ms = after.timelines[0].markers!
    expect(ms.find((m) => m.id === 'm1')?.timeMs).toBe(1000)
    expect(ms.find((m) => m.id === 'm2')?.timeMs).toBe(2500)
    expect(ms.find((m) => m.id === 'm3')?.timeMs).toBe(3000)
  })
})

describe('Work area commands (BL-11)', () => {
  it('makeSetWorkAreaCmd sets in/out, undo restores', () => {
    const scene = makeScene()
    const cmd = makeSetWorkAreaCmd('tl1', undefined, undefined, 500, 2500)
    const after = cmd.execute(scene)
    expect(after.timelines[0].workAreaInMs).toBe(500)
    expect(after.timelines[0].workAreaOutMs).toBe(2500)
    const back = cmd.undo(after)
    expect(back.timelines[0].workAreaInMs).toBeUndefined()
    expect(back.timelines[0].workAreaOutMs).toBeUndefined()
  })

  it('makeSetWorkAreaCmd can clear an existing work area', () => {
    const scene = makeScene()
    const initial = makeSetWorkAreaCmd('tl1', undefined, undefined, 500, 2500).execute(scene)
    const cmd = makeSetWorkAreaCmd('tl1', 500, 2500, undefined, undefined)
    const cleared = cmd.execute(initial)
    expect(cleared.timelines[0].workAreaInMs).toBeUndefined()
    expect(cleared.timelines[0].workAreaOutMs).toBeUndefined()
    const back = cmd.undo(cleared)
    expect(back.timelines[0].workAreaInMs).toBe(500)
    expect(back.timelines[0].workAreaOutMs).toBe(2500)
  })

  it('makeSetWorkAreaCmd can resize an existing work area', () => {
    const scene = makeScene()
    const initial = makeSetWorkAreaCmd('tl1', undefined, undefined, 500, 2500).execute(scene)
    const cmd = makeSetWorkAreaCmd('tl1', 500, 2500, 1000, 4000)
    const resized = cmd.execute(initial)
    expect(resized.timelines[0].workAreaInMs).toBe(1000)
    expect(resized.timelines[0].workAreaOutMs).toBe(4000)
    const back = cmd.undo(resized)
    expect(back.timelines[0].workAreaInMs).toBe(500)
    expect(back.timelines[0].workAreaOutMs).toBe(2500)
  })
})
