import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer } from '../../defaults'
import { captureAgentHandoffContext } from '../../agentHandoff/prompt'
import { fakeEditor } from './support/fakeEditor'

describe('MCP agent handoff context', () => {
  it('returns a live scene with a frozen focus and rejects an obsolete document', async () => {
    const editor = fakeEditor()
    try {
      const scene = emptyScene()
      scene.layers = [{ ...newRectLayer(), id: 'focus-layer', name: 'Selected' }]
      editor.replaceDocument(scene)
      const read = await editor.rawCall('get_scene')
      const focus = captureAgentHandoffContext({
        scene: read.scene, sessionId: editor.paired.id, documentEpoch: read.documentEpoch,
        revision: read.revision, timelineId: null, timeMs: 500,
        target: { layerIds: ['focus-layer'], point: { x: 25, y: 30 } },
      })
      editor.host.getAgentHandoff = id => id === 'handoff-1' ? focus : undefined
      const result = await editor.rawCall('get_handoff_context', { handoffId: 'handoff-1' })
      expect(result).toMatchObject({ documentEpoch: read.documentEpoch, revision: read.revision,
        focus: { layers: [{ id: 'focus-layer' }], point: { x: 25, y: 30 } } })
      expect(result.scene.layers[0].id).toBe('focus-layer')
      expect(result.readToken).toBeUndefined()
      await expect(editor.rawCall('get_handoff_context', { handoffId: 'unknown' })).rejects.toThrow('Agent handoff expired')
      editor.replaceDocument(scene)
      await expect(editor.rawCall('get_handoff_context', { handoffId: 'handoff-1' })).rejects.toThrow('Agent handoff expired')
    } finally { await editor.close() }
  })
  it('changes one circle color without changing any other layer or animation', async () => {
    const editor = fakeEditor()
    try {
      const circleId = (await editor.call('create_layer', { kind: 'circle' })).addedLayerIds[0]
      const otherId = (await editor.call('create_layer', { kind: 'rect' })).addedLayerIds[0]
      await editor.call('create_timeline', { id: 'motion', durationMs: 1000 })
      await editor.call('upsert_keyframes', { timelineId: 'motion', layerId: circleId, property: 'transform.x',
        keyframes: [{ timeMs: 0, value: 10 }, { timeMs: 1000, value: 80 }] })
      await editor.call('upsert_keyframes', { timelineId: 'motion', layerId: otherId, property: 'opacity',
        keyframes: [{ timeMs: 0, value: 1 }, { timeMs: 1000, value: 0.5 }] })
      const before = await editor.rawCall('get_scene')
      const focus = captureAgentHandoffContext({
        scene: before.scene, sessionId: editor.paired.id, documentEpoch: before.documentEpoch,
        revision: before.revision, timelineId: 'motion', timeMs: 500,
        target: { layerIds: [circleId] },
      })
      editor.host.getAgentHandoff = id => id === 'circle-color' ? focus : undefined
      const handoff = await editor.rawCall('get_handoff_context', { handoffId: 'circle-color' })
      expect(handoff.focus.layers.map((layer: { id: string }) => layer.id)).toEqual([circleId])
      const otherBefore = structuredClone(before.scene.layers.find((layer: { id: string }) => layer.id === otherId))
      const timelinesBefore = structuredClone(before.scene.timelines)
      const read = await editor.rawCall('get_scene')
      await editor.rawCall('update_layer', { layerId: circleId, fillColor: '#00FF00',
        expectedRevision: read.revision, readToken: read.readToken })
      const after = await editor.rawCall('get_scene')
      expect(after.scene.layers.find((layer: { id: string }) => layer.id === circleId)?.style?.fill?.color).toBe('#00FF00')
      expect(after.scene.layers.find((layer: { id: string }) => layer.id === otherId)).toEqual(otherBefore)
      expect(after.scene.timelines).toEqual(timelinesBefore)
    } finally { await editor.close() }
  })

})
