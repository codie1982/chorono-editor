import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer } from '@/lib/defaults'
import { buildAgentHandoffPrompt, captureAgentHandoffContext } from './prompt'

describe('agent handoff prompt', () => {
  const scene = emptyScene()
  const layer = newRectLayer()
  scene.layers = [{ ...layer, id: 'focus-layer', name: 'Title' }]
  const context = captureAgentHandoffContext({
    scene, sessionId: 'editor-42', documentEpoch: 'document-9', revision: 7, timelineId: 'main', timeMs: 1200,
    target: { layerIds: ['focus-layer'], point: { x: 80, y: 90 } },
  })

  it('captures the exact selection while keeping the copied prompt as an MCP reference', () => {
    expect(context).toMatchObject({
      sessionId: 'editor-42', documentEpoch: 'document-9', revision: 7, timelineId: 'main', timeMs: 1200,
      layers: [{ id: 'focus-layer', name: 'Title' }], point: { x: 80, y: 90 },
    })
    const prompt = buildAgentHandoffPrompt(context, 'diagnose', '', 'handoff-1')
    expect(prompt).toContain('get_handoff_context with sessionId "editor-42" and handoffId "handoff-1"')
    expect(prompt).not.toContain('focus-layer')
    expect(prompt).toContain('Do not change the scene')
  })

  it('requires a fresh MCP focus read and visual evidence for every question type', () => {
    for (const intent of ['explain', 'diagnose', 'suggest', 'edit', 'ask'] as const) {
      const prompt = buildAgentHandoffPrompt(context, intent, 'What changed?', 'handoff-1')
      expect(prompt).toContain('Before any scene-specific answer')
      expect(prompt).toContain('call get_scene again')
      expect(prompt).toContain('render_preview PNGs')
      expect(prompt).toContain('Code, script logs, and a passing validator alone do not prove')
    }
  })

  it('requires a concrete edit request and a handoff ID', () => {
    expect(() => buildAgentHandoffPrompt(context, 'edit', '', 'handoff-1')).toThrow('Enter a question')
    expect(() => buildAgentHandoffPrompt(context, 'explain', '', '')).toThrow('Missing MCP handoff ID')
    expect(buildAgentHandoffPrompt(context, 'edit', 'Move it left', 'handoff-1')).toContain('Move it left')
    expect(buildAgentHandoffPrompt(context, 'ask', 'Why is it hidden?', 'handoff-1')).toContain('Do not change the scene')
  })
})
