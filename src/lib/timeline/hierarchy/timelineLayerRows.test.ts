import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newTimeline } from '../../defaults'
import type { Layer, Track } from '../../types'
import { buildTimelineLayerRows } from './timelineLayerRows'
import { buildHierarchy } from '../../dope-sheet/hierarchy-builder'
import { flattenDopeSheetRows } from '../../dope-sheet/rows'

const layer = (id: string, parentId?: string): Layer => ({ ...newRectLayer(), id, name: id, parentId })
const track = (id: string): Track => ({ target: `layers.${id}.opacity`, keyframes: [{ id: `key-${id}`, timeMs: 500, value: .3, easing: { type: 'hold' } }] })
function fixture() {
  const scene = emptyScene(), timeline = newTimeline()
  delete timeline.layerIds
  scene.layers = [layer('child', 'parent'), layer('parent'), layer('other'), layer('sibling', 'parent')]
  timeline.tracks = [track('parent'), track('child'), track('other'), track('sibling')]
  scene.timelines = [timeline]
  return { scene, timeline }
}

describe('timeline hierarchy eligibility and source selection', () => {
  it('keeps nonmember ancestors as read-only context without adding them to membership', () => {
    const { scene, timeline } = fixture(); timeline.layerIds = ['child']
    const before = JSON.stringify({ scene, timeline })
    const rows = buildTimelineLayerRows(scene.layers, timeline).rows
    expect(rows.map(row => [row.layer.id, row.depth, row.timelineEligible, row.tracks.length])).toEqual([
      ['parent', 0, false, 0], ['child', 1, true, 1]])
    const found = buildTimelineLayerRows(scene.layers, timeline, { revealIds: ['other'] }).rows
    expect(found.find(row => row.layer.id === 'other')).toMatchObject({ timelineEligible: false, showTracks: false, tracks: [] })
    expect(JSON.stringify({ scene, timeline })).toBe(before)
  })

  it('preserves hidden/time-inactive editability and limits property/search tracks to actual matches', () => {
    const { scene, timeline } = fixture(); scene.layers[0].hidden = true; scene.layers[0].endMs = -1
    const rows = buildTimelineLayerRows(scene.layers, timeline, { filter: 'child' }).rows
    expect(rows.map(row => [row.layer.id, row.showTracks])).toEqual([['parent', false], ['child', true]])
    expect(rows[1].tracks[0]).toBe(timeline.tracks[1])
    expect(buildTimelineLayerRows(scene.layers, timeline, { filter: 'opacity' }).matches.size).toBe(4)
  })

  it('uses the same union of selected branches in Timeline and Dope Sheet, excluding unrelated ancestors own keys', () => {
    const { scene, timeline } = fixture(), selectedIds = new Set(['child', 'other'])
    const rows = buildTimelineLayerRows(scene.layers, timeline, { selectedOnly: true, selectedId: 'child', selectedIds }).rows
    expect(rows.flatMap(row => row.tracks).map(track => track.keyframes[0].id)).toEqual(['key-child', 'key-other'])
    const dope = flattenDopeSheetRows(buildHierarchy(scene, timeline, false, true, '', 'child', selectedIds), timeline, new Set())
    expect(dope[0].tracks.map(track => track.keyframes[0].id)).toEqual(['key-child', 'key-other'])
    expect(dope.filter(row => row.node.layerId).map(row => [row.node.layerId, row.node.depth])).toEqual([['parent', 1], ['child', 2], ['other', 1]])
    expect(buildTimelineLayerRows(scene.layers, timeline, { selectedOnly: true, selectedId: 'parent', selectedIds: new Set(['parent']) }).matches.size).toBe(3)
  })

  it('separates audio routing from independent visual/audio solo scopes', () => {
    const { scene, timeline } = fixture(); timeline.layerIds = ['child', 'foreign']
    scene.layers[1].solo = true
    scene.layers.push(...['global', 'routed', 'foreign'].map(id => ({ ...layer(id), type: 'audio' as const,
      audio: { assetId: 'asset', ...(id !== 'global' ? { timelineId: id === 'routed' ? timeline.id : 'elsewhere' } : {}) } })))
    let result = buildTimelineLayerRows(scene.layers, timeline)
    expect(Array.from(result.matches)).toEqual(['child', 'global'])
    expect(result.rows.find(row => row.layer.id === 'parent')?.showTracks).toBe(false)
    result = buildTimelineLayerRows(scene.layers, timeline, { revealIds: ['foreign'] })
    expect(result.rows.find(row => row.layer.id === 'foreign')).toMatchObject({ showTracks: false, timelineEligible: false })
    expect(result.eligible.has('routed')).toBe(false)
  })

  it('builds and flattens 5000-deep Dope Sheet ancestry without stack overflow', () => {
    const { scene, timeline } = fixture()
    scene.layers = Array.from({ length: 5000 }, (_, i) => layer(String(i), i ? String(i - 1) : undefined)).reverse()
    timeline.tracks = [track('4999')]
    const nodes = buildHierarchy(scene, timeline, true, false, '', null)
    const rows = flattenDopeSheetRows(nodes, timeline, new Set(['layer:0']))
    expect(rows.map(row => row.node.id)).toEqual(['scene', 'layer:0'])
    expect(rows[1].tracks[0]).toBe(timeline.tracks[0])
  })
})
