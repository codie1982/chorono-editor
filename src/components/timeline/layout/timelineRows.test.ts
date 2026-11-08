import { describe, expect, it } from 'vitest'
import { newRectLayer } from '@/lib/defaults'
import type { Keyframe } from '@/lib/types'
import { RowLayout } from '@/lib/editor/virtualization/RowLayout'
import { timelineKeysInBox, timelineSectionHeight, type TimelineSectionRow } from './timelineRows'

const key = (id: string, timeMs = 10, value = 1): Keyframe => ({ id, timeMs, value, easing: { type: 'linear' } })

describe('timeline row layout / marquee', () => {
  it('selects offscreen data across 3000 sections without requiring mounted DOM', () => {
    const base = newRectLayer()
    const rows: TimelineSectionRow[] = Array.from({ length: 3000 }, (_, i) => ({
      layer: { ...base, id: `layer-${i}` }, expanded: true,
      tracks: [{ target: `layers.layer-${i}.opacity`, keyframes: [key(`key-${i}`)] }],
    }))
    const layout = new RowLayout(rows.map(row => timelineSectionHeight(row, false)))
    const hits = timelineKeysInBox({ rows, layout, graph: false, box: { x: 0, y: 88 * 10, w: 500, h: 88 * 100 },
      labelWidth: 240, trackWidth: 500, offset: 0, msToX: time => time, previewMs: {},
      headerTop: i => layout.top(i), audioKeys: () => [] })
    expect(hits.size).toBe(100)
    expect(hits.has('key-10')).toBe(true)
    expect(hits.has('key-109')).toBe(true)
    expect(layout.indices(layout.range(0, 300)).length).toBeLessThan(10)
  })

  it('uses graph ordinates, live drag times, collapsed state and native x clipping', () => {
    const layer = newRectLayer(), rows: TimelineSectionRow[] = [{ layer, expanded: true,
      tracks: [{ target: `layers.${layer.id}.opacity`, keyframes: [key('low', 10, 0), key('high', 20, 1)] }] }]
    const layout = new RowLayout(rows.map(row => timelineSectionHeight(row, true)))
    const request = { rows, layout, graph: true, box: { x: 269, y: 31, w: 2, h: 2 }, labelWidth: 240,
      trackWidth: 500, offset: 0, msToX: (time: number) => time, previewMs: { high: 30 },
      headerTop: () => 0, audioKeys: () => [] }
    expect(Array.from(timelineKeysInBox(request))).toEqual(['high'])
    expect(timelineKeysInBox({ ...request, rows: [{ ...rows[0], expanded: false }] }).size).toBe(0)
    expect(timelineKeysInBox({ ...request, trackWidth: 5 }).size).toBe(0)
  })

  it('includes gain keys at a sticky audio header independently of collapsed properties', () => {
    const layer = { ...newRectLayer(), type: 'audio' as const }, rows = [{ layer, expanded: false, tracks: [] }]
    const layout = new RowLayout([64])
    const hits = timelineKeysInBox({ rows, layout, graph: false, box: { x: 0, y: 100, w: 500, h: 64 },
      labelWidth: 240, trackWidth: 500, offset: 0, msToX: time => time, previewMs: {},
      headerTop: () => 100, audioKeys: () => [key('gain')] })
    expect(Array.from(hits)).toEqual(['gain'])
  })
})
