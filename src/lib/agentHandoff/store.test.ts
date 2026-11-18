import { describe, expect, it } from 'vitest'
import { AgentHandoffStore } from './store'
import type { AgentHandoffContext } from './prompt'

const focus: AgentHandoffContext = {
  sessionId: 'session', sceneId: 'scene', documentEpoch: 'epoch', revision: 2,
  compositionSize: { width: 100, height: 100 }, timelineId: null, timeMs: 400,
  layers: [{ id: 'layer', name: 'Shape', type: 'rect' }], point: { x: 10, y: 20 },
}

describe('agent handoff store', () => {
  it('preserves the captured focus and expires it on time', () => {
    let now = 100
    const store = new AgentHandoffStore(() => now, 1000)
    const id = store.create(focus)
    focus.layers[0].name = 'changed after capture'
    const first = store.get(id)!
    expect(first.layers[0].name).toBe('Shape')
    first.layers[0].name = 'changed after read'
    expect(store.get(id)?.layers[0].name).toBe('Shape')
    now = 1100
    expect(store.get(id)).toBeUndefined()
  })
})
