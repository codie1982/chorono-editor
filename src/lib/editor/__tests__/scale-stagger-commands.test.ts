import { describe, it, expect } from 'vitest'
import {
  makeScaleKeysCmd, makeStaggerKeysCmd,
  type ScaleKfItem, type StaggerKfItem,
} from '../commands-keyframe'
import type { ChronoScene } from '../../types'

function makeScene(): ChronoScene {
  return {
    formatVersion: '1.0.0',
    composition: { id: 'test', width: 1920, height: 1080, durationMs: 5000, frameRate: 30, backgroundColor: '#000' },
    assets: [],
    layers: [],
    timelines: [
      {
        id: 'tl1',
        durationMs: 5000,
        loop: false,
        autoplay: false,
        tracks: [
          {
            target: 'layers.x.opacity',
            keyframes: [
              { id: 'k1', timeMs: 1000, value: 0 },
              { id: 'k2', timeMs: 2000, value: 50 },
              { id: 'k3', timeMs: 3000, value: 100 },
            ],
          },
        ],
      },
    ],
    parameters: [],
    triggers: [],
    bindings: [],
    initialState: {},
  } as unknown as ChronoScene
}

describe('makeScaleKeysCmd (BL-07)', () => {
  it('scales keyframe times around the pivot', () => {
    const scene = makeScene()
    const items: ScaleKfItem[] = [
      { timelineId: 'tl1', target: 'layers.x.opacity', kfId: 'k1', fromMs: 1000 },
      { timelineId: 'tl1', target: 'layers.x.opacity', kfId: 'k2', fromMs: 2000 },
      { timelineId: 'tl1', target: 'layers.x.opacity', kfId: 'k3', fromMs: 3000 },
    ]
    // Pivot at k1 (1000), scale 2× → k2 stays offset doubled (2000→3000), k3 (3000→5000)
    const cmd = makeScaleKeysCmd(items, 1000, 2)
    const after = cmd.execute(scene)
    const kfs = after.timelines[0].tracks[0].keyframes
    expect(kfs.find((k) => k.id === 'k1')!.timeMs).toBe(1000) // pivot unchanged
    expect(kfs.find((k) => k.id === 'k2')!.timeMs).toBe(3000) // offset doubled
    expect(kfs.find((k) => k.id === 'k3')!.timeMs).toBe(5000)
  })

  it('compresses (factor < 1) toward pivot', () => {
    const scene = makeScene()
    const items: ScaleKfItem[] = [
      { timelineId: 'tl1', target: 'layers.x.opacity', kfId: 'k1', fromMs: 1000 },
      { timelineId: 'tl1', target: 'layers.x.opacity', kfId: 'k3', fromMs: 3000 },
    ]
    // Pivot at midpoint 2000, scale 0.5 → k1 (1000→1500), k3 (3000→2500)
    const cmd = makeScaleKeysCmd(items, 2000, 0.5)
    const after = cmd.execute(scene)
    const kfs = after.timelines[0].tracks[0].keyframes
    expect(kfs.find((k) => k.id === 'k1')!.timeMs).toBe(1500)
    expect(kfs.find((k) => k.id === 'k3')!.timeMs).toBe(2500)
  })

  it('undo restores original times', () => {
    const scene = makeScene()
    const items: ScaleKfItem[] = [
      { timelineId: 'tl1', target: 'layers.x.opacity', kfId: 'k2', fromMs: 2000 },
    ]
    const cmd = makeScaleKeysCmd(items, 1000, 3)
    const after = cmd.execute(scene)
    const restored = cmd.undo(after)
    expect(restored.timelines[0].tracks[0].keyframes.find((k) => k.id === 'k2')!.timeMs).toBe(2000)
  })
})

describe('makeStaggerKeysCmd (BL-07)', () => {
  it('shifts each kf by index × offset (forward)', () => {
    const scene = makeScene()
    const items: StaggerKfItem[] = [
      { timelineId: 'tl1', target: 'layers.x.opacity', kfId: 'k1', fromMs: 1000, index: 0 },
      { timelineId: 'tl1', target: 'layers.x.opacity', kfId: 'k2', fromMs: 2000, index: 1 },
      { timelineId: 'tl1', target: 'layers.x.opacity', kfId: 'k3', fromMs: 3000, index: 2 },
    ]
    const cmd = makeStaggerKeysCmd(items, 100, 'forward')
    const after = cmd.execute(scene)
    const kfs = after.timelines[0].tracks[0].keyframes
    expect(kfs.find((k) => k.id === 'k1')!.timeMs).toBe(1000) // index 0 → no shift
    expect(kfs.find((k) => k.id === 'k2')!.timeMs).toBe(2100) // +100
    expect(kfs.find((k) => k.id === 'k3')!.timeMs).toBe(3200) // +200
  })

  it('shifts backward (negative multiplier)', () => {
    const scene = makeScene()
    const items: StaggerKfItem[] = [
      { timelineId: 'tl1', target: 'layers.x.opacity', kfId: 'k1', fromMs: 1000, index: 0 },
      { timelineId: 'tl1', target: 'layers.x.opacity', kfId: 'k2', fromMs: 2000, index: 1 },
      { timelineId: 'tl1', target: 'layers.x.opacity', kfId: 'k3', fromMs: 3000, index: 2 },
    ]
    const cmd = makeStaggerKeysCmd(items, 100, 'backward')
    const after = cmd.execute(scene)
    const kfs = after.timelines[0].tracks[0].keyframes
    expect(kfs.find((k) => k.id === 'k1')!.timeMs).toBe(1000)
    expect(kfs.find((k) => k.id === 'k2')!.timeMs).toBe(1900) // -100
    expect(kfs.find((k) => k.id === 'k3')!.timeMs).toBe(2800) // -200
  })

  it('undo restores original times', () => {
    const scene = makeScene()
    const items: StaggerKfItem[] = [
      { timelineId: 'tl1', target: 'layers.x.opacity', kfId: 'k2', fromMs: 2000, index: 1 },
    ]
    const cmd = makeStaggerKeysCmd(items, 500, 'forward')
    const after  = cmd.execute(scene)
    const back   = cmd.undo(after)
    expect(back.timelines[0].tracks[0].keyframes.find((k) => k.id === 'k2')!.timeMs).toBe(2000)
  })
})
