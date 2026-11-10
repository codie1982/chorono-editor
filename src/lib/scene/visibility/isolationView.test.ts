import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer } from '../../defaults'
import { projectIsolationView } from './isolationView'

function fixture() {
  const source = emptyScene()
  source.layers = [
    { ...newRectLayer(), id: 'parent', type: 'group' as const },
    { ...newRectLayer(), id: 'root', parentId: 'parent', type: 'group' as const },
    { ...newRectLayer(), id: 'child', parentId: 'root' },
    { ...newRectLayer(), id: 'hidden-child', parentId: 'root', hidden: true },
    { ...newRectLayer(), id: 'other', solo: true },
  ]
  return source
}

describe('temporary editor isolation view', () => {
  it('includes complete children and ancestor context, bypassing solo without source mutation', () => {
    const source = fixture(), before = JSON.stringify(source), view = projectIsolationView(source, ['root'])
    expect(Array.from(view.scope!)).toEqual(['root', 'child', 'hidden-child', 'parent'])
    expect(view.scene.layers.find(layer => layer.id === 'child')?.hidden).toBeFalsy()
    expect(view.scene.layers.find(layer => layer.id === 'hidden-child')?.hidden).toBe(true)
    expect(view.scene.layers.find(layer => layer.id === 'other')).toMatchObject({ hidden: true, solo: false })
    expect(JSON.stringify(source)).toBe(before)
    expect(view.scene.timelines).toBe(source.timelines)
    expect(view.scene.authoring).toBe(source.authoring)
    expect(projectIsolationView(source, []).scene).toBe(source)
  })
  it('unions multiple roots, deduplicates ancestors and includes children added during isolation', () => {
    const source = fixture()
    source.layers.push({ ...newRectLayer(), id: 'new', parentId: 'root' })
    const view = projectIsolationView(source, ['root', 'child', 'other', 'root'])
    expect(view.scope?.has('new')).toBe(true)
    expect(view.scope?.size).toBe(6)
  })
  it('preserves current manual edits on exit, including hidden/solo changes made while isolated', () => {
    const source = fixture(), edited = { ...source, layers: source.layers.map(layer => layer.id === 'child'
      ? { ...layer, hidden: true, name: 'Manual 09:05', transform: { ...layer.transform, x: 905 } } : layer) }
    const view = projectIsolationView(edited, ['root'])
    expect(view.scene.layers.find(layer => layer.id === 'child')).toMatchObject({ hidden: true, name: 'Manual 09:05', transform: { x: 905 } })
    expect(projectIsolationView(edited, []).scene).toBe(edited)
  })
  it('returns the source for deleted/audio-only roots and terminates malformed cycles', () => {
    const source = fixture()
    expect(projectIsolationView(source, ['missing']).scene).toBe(source)
    source.layers[4].type = 'audio'
    expect(projectIsolationView(source, ['other']).scene).toBe(source)
    source.layers[0].parentId = 'child'
    expect(projectIsolationView(source, ['root']).scope?.size).toBe(4)
  })
})
