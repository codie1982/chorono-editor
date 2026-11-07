import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer } from '@/lib/defaults'
import type { Keyframe, Timeline } from '@/lib/types'
import { DOPE_SHEET_ROW_HEIGHT } from '@/components/dope-sheet/types'
import { buildHierarchy } from './hierarchy-builder'
import { flattenDopeSheetRows, groupDopeSheetKeys, keysInDopeSheetBox, selectDopeSheetKey, selectDopeSheetKeys } from './rows'

const key = (id: string, timeMs: number): Keyframe => ({ id, timeMs, value: 1, easing: { type: 'linear' } })
function fixture() {
  const scene = emptyScene()
  const group = { ...newRectLayer(), id: 'group', name: 'Container', type: 'group' as const }
  const child = { ...newRectLayer(), id: 'child', name: 'Card', parentId: group.id }
  const sibling = { ...newRectLayer(), id: 'sibling', name: 'Other' }
  scene.layers = [group, child, sibling]
  const timeline: Timeline = { id: 'intro', durationMs: 1000, autoplay: false, loop: false, tracks: [
    { target: 'layers.child.opacity', keyframes: [key('a', 100), key('b', 700)] },
    { target: 'layers.child.transform.x', keyframes: [] },
    { target: 'layers.sibling.opacity', keyframes: [key('c', 500)] },
  ] }
  return { scene, timeline }
}

describe('shared Dope Sheet visible rows', () => {
  it('keeps ancestors of a nested selected layer, while excluding sibling tracks', () => {
    const { scene, timeline } = fixture()
    const nodes = buildHierarchy(scene, timeline, false, true, '', 'child')
    const rows = flattenDopeSheetRows(nodes, timeline, new Set())
    expect(rows.map(row => row.node.name)).toEqual(['Scene', 'Container', 'Card', 'Transform', 'opacity', 'x'])
    expect(rows[0].tracks.map(track => track.target)).toEqual(['layers.child.opacity', 'layers.child.transform.x'])
  })

  it('collapses hierarchy and key rows together while preserving the parent summary', () => {
    const { scene, timeline } = fixture()
    const nodes = buildHierarchy(scene, timeline, false, false, '', null)
    const rows = flattenDopeSheetRows(nodes, timeline, new Set(['layer:group']))
    expect(rows.map(row => row.node.name)).toEqual(['Scene', 'Container', 'Other', 'Transform', 'opacity'])
    expect(rows[1].tracks[0].keyframes.map(k => k.id)).toEqual(['a', 'b'])
    expect(flattenDopeSheetRows(nodes, timeline, new Set(['scene']))).toHaveLength(1)
  })

  it('filters the very same row/track data used by both columns and parent summaries', () => {
    const { scene, timeline } = fixture()
    const animated = flattenDopeSheetRows(buildHierarchy(scene, timeline, true, false, '', null), timeline, new Set())
    expect(animated.flatMap(row => row.tracks).every(track => track.keyframes.length > 0)).toBe(true)
    const search = flattenDopeSheetRows(buildHierarchy(scene, timeline, false, false, 'Card', null), timeline, new Set())
    expect(search.every(row => row.node.name !== 'Other')).toBe(true)
    expect(search[0].tracks.every(track => track.target.startsWith('layers.child.'))).toBe(true)
    const empty = flattenDopeSheetRows(buildHierarchy(scene, timeline, false, false, 'missing', null), timeline, new Set())
    expect(empty).toHaveLength(1)
    expect(empty[0].tracks).toEqual([])
  })

  it('uses one row height and content coordinate scale for marquee hits', () => {
    const { scene, timeline } = fixture()
    const rows = flattenDopeSheetRows(buildHierarchy(scene, timeline, false, false, '', null), timeline, new Set())
    const index = rows.findIndex(row => row.node.id === 'prop:layers.child.opacity')
    const y = index * DOPE_SHEET_ROW_HEIGHT
    const hits = keysInDopeSheetBox(rows, { x1: 90, x2: 110, y1: y, y2: y + DOPE_SHEET_ROW_HEIGHT }, 1, DOPE_SHEET_ROW_HEIGHT)
    expect(Array.from(hits)).toEqual(['a'])
    expect(Array.from(keysInDopeSheetBox(rows,
      { x1: 55, x2: 45, y1: y + DOPE_SHEET_ROW_HEIGHT, y2: y }, 0.5, DOPE_SHEET_ROW_HEIGHT))).toEqual(['a'])
  })

  it('deduplicates keys appearing in multiple summary rows inside a marquee', () => {
    const { scene, timeline } = fixture()
    const rows = flattenDopeSheetRows(buildHierarchy(scene, timeline, false, true, '', 'child'), timeline, new Set())
    const hits = keysInDopeSheetBox(rows, { x1: 0, x2: 800, y1: 0, y2: 1000 }, 1, DOPE_SHEET_ROW_HEIGHT)
    expect(Array.from(hits).sort()).toEqual(['a', 'b'])
  })

  it('toggles selected keys with Ctrl/Cmd, adds with Shift, and replaces on a plain click', () => {
    expect(Array.from(selectDopeSheetKey(new Set(['a', 'b']), 'a', false, true))).toEqual(['b'])
    expect(Array.from(selectDopeSheetKey(new Set(['a']), 'b', true, false))).toEqual(['a', 'b'])
    expect(Array.from(selectDopeSheetKey(new Set(['a', 'b']), 'c', false, false))).toEqual(['c'])
  })

  it('groups co-located summary keys into one select/drag target and toggles the complete cluster', () => {
    const { scene, timeline } = fixture()
    timeline.tracks[2].keyframes[0].timeMs = 100
    const rows = flattenDopeSheetRows(buildHierarchy(scene, timeline, false, false, '', null), timeline, new Set())
    const groups = groupDopeSheetKeys(rows[0])
    expect(groups).toEqual([{ timeMs: 100, ids: ['a', 'c'] }, { timeMs: 700, ids: ['b'] }])
    expect(Array.from(selectDopeSheetKeys(new Set(), groups[0].ids, false, false))).toEqual(['a', 'c'])
    expect(Array.from(selectDopeSheetKeys(new Set(['a', 'b', 'c']), groups[0].ids, false, true))).toEqual(['b'])
    expect(Array.from(selectDopeSheetKeys(new Set(['a']), groups[0].ids, false, true))).toEqual(['a', 'c'])
    expect(groupDopeSheetKeys(rows[0], { a: 200, c: 200 })[0]).toEqual({ timeMs: 200, ids: ['a', 'c'] })
  })
})
