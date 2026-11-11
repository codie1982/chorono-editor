import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newTimeline } from '../../defaults'
import { initHistory, pushHistory, undoHistory, redoHistory, type HistoryState } from '../history'
import { encodeHistory, decodeHistory, prepareHistory } from './HistoryGraph'
import { limitHistory } from './historyBudget'
import { makeSessionProject, readSessionProject } from '../session/SessionProject'
import { sessionRecordKey, sessionOutputFilename } from '../session/sessionIdentity'
import { executeAuthoredCommand } from '../authoring'
import { makeUpdateLayerCmd } from '../commands-layer'
import { sceneSourceData } from '../../format/scene/sceneSourceData'

function fixture() {
  const scene = emptyScene(), layer = newRectLayer(); layer.id = 'manual'; layer.name = 'Clock 09:05'; scene.layers = [layer]
  const timeline = newTimeline(); timeline.id = 'custom'; timeline.tracks = [{ target: 'layers.manual.opacity', keyframes: [
    { id: 'human-key', timeMs: 250.125, value: .7, easing: { type: 'easeOut' }, tangentMode: 'aligned' },
  ] }]; scene.timelines = [timeline]; return scene
}
function move(state: HistoryState, x: number) {
  const layer = state.present.layers[0]
  return pushHistory(state, executeAuthoredCommand(makeUpdateLayerCmd(layer.id, { transform: { ...layer.transform, x } }, layer), state.present))
}
function persisted(state: HistoryState) {
  const project = makeSessionProject(state, 'session-test')
  return readSessionProject(JSON.parse(JSON.stringify(project))).history
}

describe('bounded persistent Undo/Redo', () => {
  it('round-trips pending Undo and Redo in their exact order and keeps manual key metadata/ledger', () => {
    let state = initHistory(fixture()); state = move(state, 10); state = move(state, 20); state = move(state, 30); state = undoHistory(state)
    const before = JSON.stringify(state), restored = persisted(state)
    expect(restored).toEqual(state); expect(JSON.stringify(state)).toBe(before)
    expect(redoHistory(restored).present).toEqual(redoHistory(state).present)
    expect(undoHistory(restored).present).toEqual(undoHistory(state).present)
    expect(restored.present.timelines[0].tracks[0].keyframes[0].timeMs).toBe(250.125)
  })
  it('a new edit after restored Undo discards Redo exactly as the live editor', () => {
    let state = move(move(initHistory(fixture()), 1), 2); state = undoHistory(state)
    const next = move(persisted(state), 9)
    expect(next.future).toEqual([]); expect(redoHistory(next)).toBe(next)
  })
  it('shares unchanged subtrees after decoding instead of cloning the full scene per step', () => {
    const initial = fixture(); initial.layers.push({ ...newRectLayer(), id: 'untouched' })
    const state = move(move(initHistory(initial), 10), 20), restored = persisted(state)
    expect(restored.past[0].layers[1]).toBe(restored.present.layers[1])
    expect(restored.past[1].timelines).toBe(restored.present.timelines)
    expect(restored.past[0].authoring).toEqual(initial.authoring)
  })
  it('keeps base indices stable when current source has aliases serialized twice', () => {
    const scene = fixture(), other = { ...newRectLayer(), id: 'second', transform: scene.layers[0].transform }
    scene.layers.push(other)
    const past = { ...scene, composition: { ...scene.composition, id: 'previous' } }
    const state = { present: scene, past: [past], future: [] }
    expect(persisted(state)).toEqual(state)
  })
  it('stores a bounded graph much smaller than 50 full shared-geometry projects', () => {
    const initial = fixture(); initial.layers[0].text = { value: 'Detailed geometry '.repeat(20000), fontSize: 14, color: '#ffffff' }
    let state = initHistory(initial)
    for (let i = 0; i < 50; i++) state = move(state, i)
    const graph = encodeHistory(state)
    expect(JSON.stringify(graph).length).toBeLessThan(JSON.stringify(sceneSourceData(state.present)).length * 3)
    expect(persisted(state).past.length).toBe(50)
  })
  it('bounds both stacks together, retaining contiguous nearest steps', () => {
    let state = initHistory(fixture()); for (let i = 0; i < 70; i++) state = move(state, i)
    for (let i = 0; i < 10; i++) state = undoHistory(state)
    const limited = limitHistory(state, { maxSteps: 8, maxBytes: 1024 ** 2, maxNodes: 100000 })
    expect(limited.history.past).toEqual(state.past.slice(-4)); expect(limited.history.future).toEqual(state.future.slice(0, 4))
    expect(limited.droppedSteps).toBe(state.past.length + state.future.length - 8)
  })
  it('accounts for original encoded media once and drops distant snapshots at the byte budget', () => {
    const a = fixture(), b = fixture(); a.assets = [{ id: 'a', name: 'a', type: 'image', url: 'blob:a' }]; b.assets = [{ id: 'b', name: 'b', type: 'image', url: 'blob:b' }]
    const limited = limitHistory({ present: a, past: [b], future: [] }, { maxSteps: 50, maxBytes: 1024 ** 2, maxNodes: 100000, assetBytes: () => 700000 })
    expect(limited.history.present).toBe(a); expect(limited.history.past).toEqual([])
  })
  it('preserves present even if it alone exceeds memory policy', () => {
    const state = move(initHistory(fixture()), 20)
    const result = limitHistory(state, { maxSteps: 50, maxBytes: 128, maxNodes: 100 })
    expect(result.history.present).toBe(state.present); expect(result.retainedSteps).toBe(0); expect(result.presentExceedsBudget).toBe(true)
  })
  it('uses data only; corrupt/cyclic references cannot execute or enter restored history', () => {
    const state = move(initHistory(fixture()), 20), bad = structuredClone(encodeHistory(state))
    bad.nodes[0] = { object: [['self', [1, 0]]] }
    expect(() => decodeHistory(sceneSourceData(state.present), bad)).toThrow(/Cyclic/)
    expect(() => decodeHistory(state.present, { ...bad, version: 99 })).toThrow(/Unsupported/)
  })
  it('retains the portable session ID and never nests an old history envelope in a new snapshot', () => {
    const state = move(initHistory(fixture()), 3), project = makeSessionProject(state, 'saved-session')
    const opened = readSessionProject(JSON.parse(JSON.stringify(project)))
    expect(opened.sessionId).toBe('saved-session')
    expect(opened.history.present).not.toHaveProperty('editorSession')
    expect(makeSessionProject(opened.history, 'saved-session').editorSession.history.nodes.length).toBeLessThan(100)
    expect(readSessionProject(fixture()).history.past).toEqual([])
  })
  it('uses safe session partitions without changing legacy export naming by default', () => {
    expect(sessionRecordKey('session', 'tab')).toBe('session__tab')
    expect(sessionOutputFilename('scene.runtime.json', 'session')).toBe('scene.runtime__session_session.json')
    expect(sessionOutputFilename('scene.svg')).toBe('scene.svg')
    expect(() => sessionRecordKey('../escape', 'tab')).toThrow(/Invalid/)
  })
  it('limits the live history to what can be persisted in its graph budget', () => {
    let state = initHistory(fixture()); for (let i = 0; i < 60; i++) state = move(state, i)
    const prepared = prepareHistory(state), graph = encodeHistory(prepared.history)
    expect(prepared.retainedSteps).toBeLessThanOrEqual(50)
    expect(graph.past.length).toBe(prepared.history.past.length); expect(graph.future.length).toBe(prepared.history.future.length)
  })
})
