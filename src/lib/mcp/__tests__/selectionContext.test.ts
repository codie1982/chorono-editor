import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer } from '../../defaults'
import { captureAgentHandoffContext } from '../../agentHandoff/prompt'
import { fakeEditor } from './support/fakeEditor'

/** Authored properties stay in scene.layers; selection carries stable identity
 * metadata even when names match and display/source order differs. */
function fixture() {
  const scene = emptyScene()
  scene.layers = [
    { ...newRectLayer(), id: 'group', name: 'Group', type: 'group' },
    { ...newRectLayer(), id: 'first', name: 'Same name', parentId: 'group' },
    { ...newRectLayer(), id: 'second', name: 'Same name' },
  ]
  return scene
}

describe('MCP read-time selection context', () => {
  it('returns one nested layer identity and complete source without changing revision or history', async () => {
    const editor = fakeEditor(), scene = fixture()
    try {
      editor.replaceDocument(scene)
      editor.setLayerSelection(['first'])
      const read = await editor.rawCall('get_scene')
      expect(read.selected).toEqual({ primaryLayerId: 'first', layerIds: ['first'], layers: [
        { id: 'first', name: 'Same name', type: 'shape', address: ['layer', 'first'], parentId: 'group' },
      ] })
      expect(read.scene).toEqual(scene)
      expect(read.scene.layers[1].transform).toEqual(scene.layers[1].transform)
      expect(read.scene.selected).toBeUndefined()
      expect(read.selected.layers[0].transform).toBeUndefined()
      expect(read.revision).toBe(0)
      expect(editor.historyLength()).toBe(0)
    } finally { await editor.close() }
  })

  it('preserves multi-selection order and primary independently of layer order and duplicate names', async () => {
    const editor = fakeEditor()
    try {
      editor.replaceDocument(fixture())
      editor.setLayerSelection(['second', 'first', 'second'], 'first')
      const read = await editor.rawCall('get_scene')
      expect(read.selected.primaryLayerId).toBe('first')
      expect(read.selected.layerIds).toEqual(['second', 'first'])
      expect(read.selected.layers.map((layer: { address: string[] }) => layer.address))
        .toEqual([['layer', 'second'], ['layer', 'first']])
      expect(read.selected.layers[0].parentId).toBeNull()
      read.selected.layers[0].name = 'Caller copy'
      read.selected.layerIds.push('unrelated')
      const next = await editor.rawCall('get_scene')
      expect(next.selected.layers[0].name).toBe('Same name')
      expect(next.selected.layerIds).toEqual(['second', 'first'])
    } finally { await editor.close() }
  })

  it('reads a changed or cleared selection fresh even with the same source revision and requestId', async () => {
    const editor = fakeEditor()
    try {
      editor.replaceDocument(fixture())
      editor.setLayerSelection(['first'])
      const first = await editor.rawCall('get_scene', { requestId: 'same-read' })
      editor.setLayerSelection(['second'])
      const second = await editor.rawCall('get_scene', { requestId: 'same-read' })
      expect(second.revision).toBe(first.revision)
      expect(second.selected.primaryLayerId).toBe('second')
      expect(first.selected.primaryLayerId).toBe('first')
      editor.setLayerSelection([])
      const cleared = await editor.rawCall('get_scene')
      expect(cleared.selected).toEqual({ primaryLayerId: null, layerIds: [], layers: [] })
      expect(cleared.revision).toBe(first.revision)
      expect(editor.historyLength()).toBe(0)
    } finally { await editor.close() }
  })

  it('drops deleted/stale IDs and uses the shared primary fallback without rewriting UI state', async () => {
    const editor = fakeEditor()
    try {
      editor.replaceDocument(fixture())
      editor.setLayerSelection(['missing', 'second', 'first'], 'first')
      await editor.call('delete_layer', { layerId: 'first' })
      const read = await editor.rawCall('get_scene')
      expect(read.selected.primaryLayerId).toBe('second')
      expect(read.selected.layerIds).toEqual(['second'])
      expect(Array.from(editor.host.getLayerSelection!().selectedIds)).toEqual(['missing', 'second', 'first'])
      expect(editor.historyLength()).toBe(1)
      editor.setLayerSelection(['missing', 'first'])
      expect((await editor.rawCall('get_scene')).selected).toEqual({ primaryLayerId: null, layerIds: [], layers: [] })
    } finally { await editor.close() }
  })

  it('refreshes names and parents from source while retaining the stable address after reorder', async () => {
    const editor = fakeEditor()
    try {
      editor.replaceDocument(fixture())
      editor.setLayerSelection(['first'])
      const before = await editor.rawCall('get_scene')
      editor.host.editor.dispatchCommand({ label: 'Manual rename/reparent/reorder',
        execute: scene => ({ ...scene, layers: [...scene.layers].reverse().map(layer => layer.id === 'first'
          ? { ...layer, name: 'Renamed', parentId: undefined } : layer) }), undo: () => before.scene })
      const after = await editor.rawCall('get_scene')
      expect(after.selected.layers[0]).toMatchObject({ name: 'Renamed', parentId: null, address: ['layer', 'first'] })
      expect(before.selected.layers[0]).toMatchObject({ name: 'Same name', parentId: 'group' })
    } finally { await editor.close() }
  })

  it('keeps captured handoff focus separate from a later UI selection', async () => {
    const editor = fakeEditor()
    try {
      editor.replaceDocument(fixture())
      editor.setLayerSelection(['first'])
      const read = await editor.rawCall('get_scene')
      const focus = captureAgentHandoffContext({ scene: read.scene, sessionId: editor.paired.id,
        documentEpoch: read.documentEpoch, revision: read.revision, timelineId: null, timeMs: 0,
        target: { layerIds: read.selected.layerIds } })
      editor.host.getAgentHandoff = () => focus
      editor.setLayerSelection(['second'])
      const handoff = await editor.rawCall('get_handoff_context', { handoffId: 'frozen' })
      expect(handoff.focus.layers.map((layer: { id: string }) => layer.id)).toEqual(['first'])
      expect(handoff.selected.layerIds).toEqual(['second'])
      expect(handoff.readToken).toBeUndefined()
    } finally { await editor.close() }
  })

  it('reports unavailable selection explicitly for an embedded host without a provider', async () => {
    const editor = fakeEditor()
    try {
      delete editor.host.getLayerSelection
      expect((await editor.rawCall('get_scene')).selected).toBeNull()
    } finally { await editor.close() }
  })

  it('keeps selection local to the explicitly chosen editor session', async () => {
    const first = fakeEditor(), second = fakeEditor()
    try {
      first.replaceDocument(fixture()); second.replaceDocument(fixture())
      first.setLayerSelection(['first']); second.setLayerSelection(['second'])
      expect((await first.rawCall('get_scene')).selected.layerIds).toEqual(['first'])
      expect((await second.rawCall('get_scene')).selected.layerIds).toEqual(['second'])
    } finally { await first.close(); await second.close() }
  })
})
