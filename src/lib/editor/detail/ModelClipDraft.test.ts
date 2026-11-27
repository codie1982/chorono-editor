import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newTimeline } from '../../defaults'
import { newModelLayer } from '../../model3d/source/modelDefaults'
import { ItemDetailSession } from './ItemDetailSession'
import { addModelClip, ModelClipDraft, modelClipCommand } from './ModelClipDraft'
import { makeAddKfCmd, makeKeyframeLayerSnapshotCmd, makeMoveKfCmd, makeUpdateKfValueCmd } from '../commands-keyframe'
import { contentTimelineContext } from '../../timeline/authoring/TimelineAuthoringContext'
import { executeAuthoredCommand } from '../authoring'
import { initHistory, pushHistory, undoHistory, redoHistory } from '../history'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'
import { evaluateSceneFrame } from '../../runtime/evaluateSceneFrame'
import { cloneSingleLayer } from '../../clone/CloneSingleLayer'
import { makeUpdateLayerCmd } from '../commands-layer'
import { makeCurveKeyframeChangesCmd, makeReplaceCurveKeysCmd, insertCurveKeyframe } from '../../timeline/curveEditing'
import '../../registry/bootstrap'
import type { ChronoScene } from '../../types'

/** Sentinels cover independent outer keys, hierarchy and unrelated manual work. */
function fixture(): ChronoScene {
  const parent = { ...newRectLayer(), id: 'parent', type: 'group' as const }
  const model = { ...newModelLayer('model', 'asset', 'Manual model'), parentId: 'parent' }
  return { ...emptyScene(), layers: [parent, model, { ...newRectLayer(), id: 'manual' }],
    assets: [{ id: 'asset', type: 'model3d' as const, name: 'Model', url: 'data:model/gltf+json;base64,e30=' }],
    timelines: [{ ...newTimeline(), id: 'main', layerIds: ['model'], tracks: [{ target: 'layers.model.transform.x',
      keyframes: [{ id: 'manual-outer', timeMs: 400, value: 80, easing: { type: 'linear' as const } }] }] }] }
}
function open(source = fixture()) { return new ItemDetailSession(source, 4, new AbortController().signal, 'model') }
/** Create an authored rotation clip through actual T0 native commands. */
function animated(session: ItemDetailSession) {
  const content = session.animation!, command = addModelClip(content)
  let draft = command.execute(content.initial)
  const context = contentTimelineContext(draft, 'model', command.clipId)
  for (const [timeMs, value] of [[0, 0], [1000, 90]]) {
    const layer = draft.layers[0]
    draft = makeKeyframeLayerSnapshotCmd(command.clipId, { ...layer, model3d: { ...layer.model3d!, rotation: { ...layer.model3d!.rotation, y: value } } },
      timeMs, ['model3d.rotation.y'], context).execute(draft)
  }
  return { draft, context, clipId: command.clipId }
}

describe('private model detail clip draft', () => {
  it('opens a neutral isolated projection without upgrading source or importing global tracks', () => {
    const source = fixture(), before = JSON.stringify(source), session = open(source), content = session.animation!
    expect(content.initial.layers).toHaveLength(1)
    expect(content.layer.parentId).toBeUndefined()
    expect(content.initial.timelines).toEqual([])
    expect(content.layer.transform.x).toBe(0)
    expect(session.prepareClipApply(content.initial, source, 4, session.document)).toBeNull()
    expect(JSON.stringify(source)).toBe(before)
    expect(source.layers[1].model3d!.version).toBe(1)
  })
  it('persists local addresses, reopens exact key IDs and keeps main animation/hierarchy/asset references', () => {
    const source = fixture(), session = open(source), { draft } = animated(session)
    const command = session.prepareClipApply(draft, source, 4, session.document)!, next = command.execute(source)
    expect(next.timelines).toBe(source.timelines); expect(next.assets).toBe(source.assets)
    expect(next.layers[0]).toBe(source.layers[0]); expect(next.layers[2]).toBe(source.layers[2])
    expect(next.layers[1].parentId).toBe('parent'); expect(next.layers[1].transform).toBe(source.layers[1].transform)
    const model = next.layers[1].model3d!
    expect(model.version).toBe(2)
    expect(model.animation!.clips[0].tracks[0].target).toBe('layers.content.model3d.rotation.y')
    expect(JSON.stringify(model.animation)).not.toContain('layers.model.')
    const restored = parseSceneJson(JSON.stringify(next), true), reopened = open(restored).animation!
    expect(reopened.initial.timelines[0].tracks[0]).toEqual(draft.timelines[0].tracks[0])
    expect(evaluateSceneFrame(restored, 500).overrides.get('layers.model.model3d.rotation.y')).toBe(45)
  })
  it('applies any number of local edits as one main Undo/Redo while Cancel leaves source intact', () => {
    const source = fixture(), before = JSON.stringify(source), session = open(source), { draft, context, clipId } = animated(session)
    const changed = makeUpdateKfValueCmd(clipId, 'layers.model.model3d.rotation.y', draft.timelines[0].tracks[0].keyframes[1].id, 90, 120, context).execute(draft)
    expect(JSON.stringify(source)).toBe(before)
    const command = session.prepareClipApply(changed, source, 4, session.document)!
    const history = pushHistory(initHistory(source), executeAuthoredCommand(command, source))
    expect(history.past).toHaveLength(1)
    expect(undoHistory(history).present).toBe(source)
    expect(redoHistory(undoHistory(history)).present).toBe(history.present)
    session.close(); expect(() => command.execute(source)).toThrow('stale')
    expect(JSON.stringify(source)).toBe(before)
  })
  it('rejects stale apply and foreign layer/asset/global state edits before publication', () => {
    const source = fixture(), session = open(source), { draft } = animated(session), content = session.animation!
    expect(() => session.prepareClipApply(draft, source, 5, session.document)).toThrow('scene changed')
    expect(() => content.model({ ...draft, layers: [...draft.layers, source.layers[2]] })).toThrow('owner')
    expect(() => content.model({ ...draft, assets: [] })).toThrow('outside')
    expect(() => content.model({ ...draft, initialState: { activeClipId: null, foreign: 1 } })).toThrow('unrelated')
    expect(() => content.validateLayer({ ...content.layer, parentId: 'parent' })).toThrow('cannot change')
    const cmd = session.prepareClipApply(draft, source, 4, session.document)!
    expect(() => cmd.execute({ ...source })).toThrow('stale')
  })
  it('reuses native scope, timing collision and bounded duration checks', () => {
    const session = open(), { draft, context, clipId } = animated(session), content = session.animation!
    expect(() => makeAddKfCmd(clipId, 'layers.model.transform.x', { id: 'foreign', timeMs: 0, value: 5, easing: { type: 'linear' } }, context).execute(draft)).toThrow()
    expect(() => makeMoveKfCmd(clipId, 'layers.model.model3d.rotation.y', draft.timelines[0].tracks[0].keyframes[1].id, 1000, 0, context).execute(draft)).toThrow()
    expect(() => modelClipCommand(content, 'Shorten', scene => ({ ...scene, timelines: scene.timelines.map(t => ({ ...t, durationMs: 500 })) })).execute(draft)).toThrow()
    const create = addModelClip(content), created = create.execute(draft)
    expect(create.undo(created)).toBe(draft)
    expect(create.execute(draft).timelines[1].id).toBe(created.timelines[1].id)
  })
  it('keeps version 1 opaque animation metadata unchanged and refuses an implicit conversion', () => {
    const source = fixture()
    Object.assign(source.layers[1].model3d!, { animation: { vendor: 'legacy manual metadata' } })
    const session = open(source), content = session.animation!
    expect(content.model(content.initial)).toEqual(source.layers[1].model3d)
    expect(() => addModelClip(content).execute(content.initial)).toThrow('metadata is preserved')
  })
  it('copies private clips without scene ID aliases; editing the copy cannot change original keys', () => {
    const session = open(), { draft } = animated(session), source = session.prepareClipApply(draft, session.source, 4, session.document)!.execute(session.source)
    const copy = cloneSingleLayer(source.layers[1]).clonedLayer
    const copied = new ModelClipDraft({ ...source, layers: [...source.layers, copy] }, copy)
    expect(copied.initial.timelines[0].tracks[0].target).toBe(`layers.${copy.id}.model3d.rotation.y`)
    copy.model3d!.animation!.clips[0].tracks[0].keyframes[0].value = 12
    expect(source.layers[1].model3d!.animation!.clips[0].tracks[0].keyframes[0].value).toBe(0)
  })
  it('shares the curve split/retime contracts in content scope and rejects them in scene scope', () => {
    const session = open(), { draft, context, clipId } = animated(session), track = draft.timelines[0].tracks[0]
    const split = insertCurveKeyframe(track, 500, () => 'split')
    expect(split.ok).toBe(true)
    if (!split.ok) return
    expect(() => makeReplaceCurveKeysCmd(clipId, track, split.track).execute(draft)).toThrow('Internal content')
    const command = makeReplaceCurveKeysCmd(clipId, track, split.track, context), inserted = command.execute(draft)
    expect(inserted.timelines[0].tracks[0].keyframes).toHaveLength(3)
    const change = { target: track.target, keyframe: { ...split.track.keyframes[1], timeMs: 600, value: 54 } }
    const moved = makeCurveKeyframeChangesCmd(inserted, clipId, [change], { context }).execute(inserted)
    expect(moved.timelines[0].tracks[0].keyframes[1]).toMatchObject({ id: 'split', timeMs: 600, value: 54 })
    expect(command.undo(inserted).timelines[0].tracks[0].keyframes).toBe(track.keyframes)
    expect(() => session.animation!.model(moved)).not.toThrow()
  })
  it('protects owned clip data/base channels from generic patches while allowing outer edits and detail Apply', () => {
    const session = open(), { draft } = animated(session), source = session.prepareClipApply(draft, session.source, 4, session.document)!.execute(session.source)
    const layer = source.layers[1], model = layer.model3d!
    expect(() => makeUpdateLayerCmd(layer.id, { model3d: { ...model, rotation: { ...model.rotation, y: 22 } } }, layer).execute(source)).toThrow('content clip')
    expect(() => makeUpdateLayerCmd(layer.id, { model3d: { ...model, animation: { ...model.animation!, activeClipId: null } } }, layer).execute(source)).toThrow('owning content')
    const moved = makeUpdateLayerCmd(layer.id, { transform: { ...layer.transform, x: 99 } }, layer).execute(source)
    expect(moved.layers[1].model3d).toBe(model)
    const reopened = open(source), second = addModelClip(reopened.animation!).execute(reopened.animation!.initial)
    expect(() => reopened.prepareClipApply(second, source, 4, reopened.document)!.execute(source)).not.toThrow()
  })
  it('does not normalize optional private membership when opening or applying an untouched saved clip', () => {
    const session = open(), { draft } = animated(session), source = session.prepareClipApply(draft, session.source, 4, session.document)!.execute(session.source)
    delete source.layers[1].model3d!.animation!.clips[0].layerIds
    const saved = parseSceneJson(JSON.stringify(source)), reopened = open(saved)
    expect(reopened.animation!.model(reopened.animation!.initial)).toEqual(saved.layers[1].model3d)
    expect(reopened.prepareClipApply(reopened.animation!.initial, saved, 4, reopened.document)).toBeNull()
  })
})
