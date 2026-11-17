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
})
