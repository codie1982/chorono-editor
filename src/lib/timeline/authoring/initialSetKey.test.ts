import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer } from '../../defaults'
import { prepareInitialSetKey } from './initialSetKey'
import { initHistory, pushHistory, undoHistory, redoHistory } from '../../editor/history'

describe('first Set Key without an active Timeline', () => {
  it('creates a Timeline and keys in one history entry, preserving source and stable redo IDs', () => {
    const layer = newRectLayer(), source = { ...emptyScene(), layers: [layer], timelines: [] }
    const plan = prepareInitialSetKey(source, { layerIds: [layer.id], timeMs: 0, keyset: 'transform' })
    expect(source.timelines).toEqual([]); expect(plan.diagnostics).toEqual([])
    const result = plan.command!.execute(source)
    expect(result.layers).toBe(source.layers); expect(result.timelines).toHaveLength(1)
    expect(result.timelines[0].tracks).toHaveLength(6)
    expect(result.timelines[0].id).toBe(plan.activateTimelineId)
    const history = pushHistory(initHistory(source), result)
    expect(history.past).toHaveLength(1); expect(undoHistory(history).present).toBe(source)
    expect(redoHistory(undoHistory(history)).present).toBe(result)
    expect(plan.command!.execute(source)).toEqual(result); expect(plan.command!.undo(result)).toEqual(source)
    expect(() => plan.command!.execute({ ...source, layers: [newRectLayer()] })).toThrow(/Source changed/)
  })
  it('does not create an empty Timeline for a locked or nonkeyable selection', () => {
    const layer = { ...newRectLayer(), locked: true }, source = { ...emptyScene(), layers: [layer], timelines: [] }
    expect(prepareInitialSetKey(source, { layerIds: [layer.id], timeMs: 0 }).command).toBeNull()
    expect(source.timelines).toEqual([])
  })
})
