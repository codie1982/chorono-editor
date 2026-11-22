import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newTimeline } from '../../defaults'
import { projectIsolationView } from './isolationView'
import { buildLegacyLayerRows } from '../../sceneExplorer/legacyLayerRows'
import { buildSceneExplorerRows } from '../../sceneExplorer/sceneExplorerModel'
import { buildTimelineLayerRows } from '../../timeline/hierarchy/timelineLayerRows'
import { buildHierarchy } from '../../dope-sheet/hierarchy-builder'
import { timelineTracksInScope } from '../../timeline/authoring/timelinePropertyScope'
import { resolveSelectedKeyframes } from '../../timeline/keyframeSelection'

/** Nested isolated content plus animated ancestors, siblings and outside solo. */
function fixture() {
  const source = emptyScene()
  source.layers = [
    { ...newRectLayer(), id: 'parent', type: 'group' as const },
    { ...newRectLayer(), id: 'sibling', parentId: 'parent' },
    { ...newRectLayer(), id: 'root', type: 'group' as const, parentId: 'parent' },
    { ...newRectLayer(), id: 'hidden', parentId: 'root', hidden: true },
    { ...newRectLayer(), id: 'child', parentId: 'root' },
    { ...newRectLayer(), id: 'outside', solo: true },
  ]
  source.timelines = [newTimeline()]
  source.timelines[0].layerIds = source.layers.map(layer => layer.id)
  source.timelines[0].tracks = source.layers.map(layer => ({ target: `layers.${layer.id}.transform.x`,
    keyframes: [{ id: `${layer.id}-key`, timeMs: 250, value: 20, easing: { type: 'linear' as const } }] }))
  return source
}

describe('isolation is a hard editor view boundary, not a source projection for editing', () => {
  it('keeps render ancestors separate from the editable content subtree', () => {
    const source = fixture(), view = projectIsolationView(source, ['root'])
    expect(view.contentScope).toEqual(new Set(['root', 'hidden', 'child']))
    expect(view.scope?.has('parent')).toBe(true)
    expect(view.contentScope?.has('parent')).toBe(false)
    expect(projectIsolationView(source, []).contentScope).toBeNull()
  })
  it('re-roots Layers without changing global reorder indices, identities or parent transforms', () => {
    const source = fixture(), before = JSON.stringify(source), { contentScope } = projectIsolationView(source, ['root'])
    const rows = buildLegacyLayerRows(source.layers, new Set(), contentScope)
    expect(rows.map(row => row.layer.id)).toEqual(['root', 'child', 'hidden'])
    expect(rows[0]).toMatchObject({ realIdx: 2, depth: 0 })
    expect(rows[0].layer).toBe(source.layers[2])
    expect(rows[0].layer.parentId).toBe('parent')
    expect(JSON.stringify(source)).toBe(before)
    expect(buildLegacyLayerRows(source.layers, new Set()).length).toBe(source.layers.length)
  })
  it('filters Timeline and Explorer even when outside solo and explicit Find request outside objects', () => {
    const source = fixture(), { contentScope } = projectIsolationView(source, ['root'])
    const timeline = buildTimelineLayerRows(source.layers, source.timelines[0], { layerScope: contentScope, revealIds: ['outside', 'parent', 'sibling'] })
    const explorer = buildSceneExplorerRows(source.layers, { collapsedIds: new Set(), layerScope: contentScope, revealIds: ['outside', 'parent'] })
    expect(timeline.rows.map(row => row.layer.id)).toEqual(['root', 'hidden', 'child'])
    expect(explorer.filter(row => row.kind === 'layer').map(row => row.layer.id)).toEqual(['root', 'hidden', 'child'])
    expect(timeline.rows[0].depth).toBe(0)
    expect(timeline.rows.flatMap(row => row.tracks).map(track => track.keyframes[0].id)).toEqual(['root-key', 'hidden-key', 'child-key'])
    expect(source.layers[5].solo).toBe(true)
  })
  it('shares the boundary with Dope Sheet; outside ancestor keys never become editable context', () => {
    const source = fixture(), { contentScope } = projectIsolationView(source, ['root'])
    const nodes = buildHierarchy(source, source.timelines[0], false, false, '', null, undefined, undefined, contentScope)
    expect(nodes.filter(node => node.type === 'property').map(node => node.trackTarget)).toEqual([
      'layers.root.transform.x', 'layers.hidden.transform.x', 'layers.child.transform.x',
    ])
    expect(nodes.some(node => node.layerId === 'parent' || node.layerId === 'outside')).toBe(false)
  })
  it('bounds bulk/clipboard key resolution and track selection without losing saved keys', () => {
    const source = fixture(), before = JSON.stringify(source), timeline = source.timelines[0]
    const scope = projectIsolationView(source, ['root']).contentScope
    const keys = new Set(timeline.tracks.flatMap(track => track.keyframes.map(key => key.id)))
    expect(resolveSelectedKeyframes(source, timeline.id, keys, scope).map(item => item.kf.id)).toEqual(['root-key', 'hidden-key', 'child-key'])
    const tracks = timelineTracksInScope(source.layers, timeline.tracks, undefined, scope)
    expect(tracks).toHaveLength(3)
    expect(tracks[0]).toBe(timeline.tracks[2])
    expect(timelineTracksInScope(source.layers, timeline.tracks)).toBe(timeline.tracks)
    expect(JSON.stringify(source)).toBe(before)
    expect(resolveSelectedKeyframes(source, timeline.id, keys)).toHaveLength(6)
  })
  it('handles an empty scope, collapse and a live child edit without leaking outside rows', () => {
    const source = fixture(), scope = projectIsolationView(source, ['root']).contentScope
    expect(buildTimelineLayerRows(source.layers, source.timelines[0], { layerScope: new Set(), revealIds: ['outside'] }).rows).toEqual([])
    expect(buildLegacyLayerRows(source.layers, new Set(['root']), scope).map(row => row.layer.id)).toEqual(['root'])
    source.layers.push({ ...newRectLayer(), id: 'new-child', parentId: 'root' })
    const next = projectIsolationView(source, ['root']).contentScope
    expect(buildLegacyLayerRows(source.layers, new Set(), next).some(row => row.layer.id === 'new-child')).toBe(true)
    const moved = { ...source, layers: source.layers.map(layer => layer.id === 'child' ? { ...layer, parentId: 'parent' } : layer) }
    expect(projectIsolationView(moved, ['root']).contentScope?.has('child')).toBe(false)
  })
})
