import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newTimeline } from '../../defaults'
import type { ChronoScene, Keyframe } from '../../types'
import { newModelLayer } from '../../model3d/source/modelDefaults'
import { modelDefinition } from '../../model3d/source/modelDefinition'
import { modelChannels } from '../../model3d/animation/modelChannels'
import { contentTimelineContext, assertTimelineContext, SCENE_TIMELINE_CONTEXT } from './TimelineAuthoringContext'
import { assertTimelineEditTarget, isTimelineTargetInScope, timelineTracksInScope } from './timelinePropertyScope'
import { prepareSetKey } from './setKey'
import { applyKeyframeBatch } from './keyframeBatch'
import { prepareClearKeyframes } from './clearKeyframes'
import { navigateTimeline } from './timelineNavigation'
import { buildTimelineLayerRows } from '../hierarchy/timelineLayerRows'
import { buildHierarchy } from '../../dope-sheet/hierarchy-builder'
import { makeAddAnimationCmd } from '../addAnimationCommand'
import { makeAddKfCmd, makeBulkDeleteKfCmd, makeMoveKfCmd, makePasteKfCmd, makeUpdateEasingCmd, makeUpdateKfValueCmd } from '../../editor/commands-keyframe'
import { makeSetOutOfRangeCmd, makeSetTrackControllerCmd } from '../../editor/commands-track'
import { setAnimatedPropertyValue } from '../../editor/autoKeyframe'
import { LayerHandle, type ApiContext } from '../../script/api/LayerHandle'
import { TimelineHandle } from '../../script/api/TimelineHandle'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'

const camera = 'layers.robot.model3d.camera.yaw'
const outer = 'layers.robot.transform.x'
const sibling = 'layers.other.model3d.camera.yaw'

/** Saved mixed tracks deliberately model existing manual source. The content
 * context must project/edit its own leaves without deleting the outer/sibling
 * tracks or rewriting legacy key metadata. This is not a persisted inner clip.
 */
function fixture(): ChronoScene {
  const key = (id: string, timeMs: number, value: number): Keyframe => ({ id, timeMs, value,
    tangentMode: 'aligned', easing: { type: 'customBezier', bezier: { cx1: .2, cy1: .1, cx2: .8, cy2: .9 } } })
  const scene = emptyScene()
  return { ...scene, initialState: { manualNote: 'keep' },
    layers: [newModelLayer('robot', 'asset'), newModelLayer('other', 'asset'), { ...newRectLayer(), id: 'rect' }],
    timelines: [{ ...newTimeline(), id: 'main', durationMs: 2000, tracks: [{ target: outer, keyframes: [key('main', 1200, 90)] }] },
      { ...newTimeline(), id: 'draft', durationMs: 400, layerIds: undefined, tracks: [
        { target: camera, keyframes: [key('camera-a', 0, 20), key('camera-b', 200, 60)] },
        { target: outer, keyframes: [key('outer', 350, 100)] },
        { target: sibling, keyframes: [key('sibling', 300, 80)] },
      ] }],
  }
}

describe('explicit scene/content Timeline authoring context', () => {
  it('binds an immutable content context to an existing capable owner and Timeline', () => {
    const scene = fixture(), before = JSON.stringify(scene)
    const context = contentTimelineContext(scene, 'robot', 'draft')
    expect(Object.isFrozen(context)).toBe(true)
    expect(context).toEqual({ kind: 'content', ownerLayerId: 'robot', timelineId: 'draft' })
    for (const [owner, timeline] of [['missing', 'draft'], ['rect', 'draft'], ['robot', 'missing']]) {
      expect(() => contentTimelineContext(scene, owner, timeline)).toThrow()
    }
    expect(() => assertTimelineContext(scene, 'main', context)).toThrow(/own this Timeline/)
    expect(JSON.stringify(scene)).toBe(before)
  })

  it('separates outer transforms from exact internal leaves and rejects structural/foreign targets', () => {
    const scene = fixture(), context = contentTimelineContext(scene, 'robot', 'draft')
    expect(isTimelineTargetInScope(scene.layers, outer)).toBe(true)
    expect(isTimelineTargetInScope(scene.layers, camera)).toBe(false)
    for (const path of modelDefinition.contentTimelinePaths!) {
      const target = `layers.robot.${path}`
      expect(isTimelineTargetInScope(scene.layers, target, undefined, context)).toBe(true)
      expect(isTimelineTargetInScope(scene.layers, target)).toBe(false)
    }
    for (const target of [outer, sibling, 'layers.robot.opacity', 'layers.robot.model3d',
      'layers.robot.model3d.camera', 'layers.robot.model3d.assetId', 'layers.robot.model3d.version',
      'layers.robot.model3d.lighting.unknown', 'layers.missing.model3d.camera.yaw', 'parameters.speed', 'nonsense']) {
      expect(isTimelineTargetInScope(scene.layers, target, undefined, context), target).toBe(false)
      expect(() => assertTimelineEditTarget(scene, 'draft', target, context)).toThrow()
    }
    expect(isTimelineTargetInScope(scene.layers, 'plugins.legacy.value', undefined, SCENE_TIMELINE_CONTEXT)).toBe(true)
  })

  it('Set Key uses declared content schemas, local duration and preserves existing manual key identity', () => {
    const scene = fixture(), before = JSON.stringify(scene), context = contentTimelineContext(scene, 'robot', 'draft')
    expect(() => prepareSetKey(scene, { timelineId: 'draft', layerIds: ['robot'], timeMs: 900, context })).toThrow(/0–400/)
    const plan = prepareSetKey(scene, { timelineId: 'draft', layerIds: ['robot', 'other'], timeMs: 400, context })
    expect(plan.timeMs).toBe(400)
    expect(plan.targets.sort()).toEqual(modelChannels(scene.layers[0].model3d).map(path => `layers.robot.${path}`).sort())
    const next = plan.command!.execute(scene)
    expect(next.timelines[0]).toBe(scene.timelines[0])
    expect(next.timelines[1].tracks.find(track => track.target === camera)!.keyframes[0]).toBe(scene.timelines[1].tracks[0].keyframes[0])
    expect(next.timelines[1].tracks.find(track => track.target === outer)).toBe(scene.timelines[1].tracks[1])
    expect(next.layers).toBe(scene.layers)
    expect(next.initialState).toBe(scene.initialState)
    expect(plan.command!.undo(next)).toEqual(scene)
    expect(JSON.stringify(scene)).toBe(before)
  })

  it('content commands update only their owner and undo exact easing/tangent data', () => {
    const scene = fixture(), context = contentTimelineContext(scene, 'robot', 'draft')
    const before = scene.timelines[1].tracks[0].keyframes[0]
    const edit = makeUpdateKfValueCmd('draft', camera, before.id, before.value, 35, context)
    const edited = edit.execute(scene)
    expect(edited.timelines[1].tracks[0].keyframes[0]).toEqual({ ...before, value: 35 })
    expect(edit.undo(edited)).toEqual(scene)
    const easing = makeUpdateEasingCmd('draft', camera, before.id, before.easing, { type: 'hold' }, context)
    expect(easing.undo(easing.execute(scene))).toEqual(scene)
    const moved = makeMoveKfCmd('draft', camera, before.id, 0, 50, context)
    expect(moved.undo(moved.execute(scene))).toEqual(scene)
    const range = makeSetOutOfRangeCmd('draft', camera, undefined, { before: 'constant', after: 'cycle' }, context)
    expect(range.undo(range.execute(scene))).toEqual(scene)
    const controller = makeSetTrackControllerCmd('draft', camera, undefined, { type: 'keyframe' }, context)
    expect(controller.undo(controller.execute(scene))).toEqual(scene)
  })

  it('rejects mixed paste/delete and cross-Timeline edits atomically', () => {
    const scene = fixture(), context = contentTimelineContext(scene, 'robot', 'draft'), before = JSON.stringify(scene)
    const key = { ...scene.timelines[1].tracks[0].keyframes[0], id: 'paste', timeMs: 100 }
    const valid = { timelineId: 'draft', target: camera, kf: key }
    expect(() => makePasteKfCmd([valid, { ...valid, target: sibling }], { context }).execute(scene)).toThrow()
    expect(() => makeBulkDeleteKfCmd([
      { timelineId: 'draft', target: camera, kf: scene.timelines[1].tracks[0].keyframes[0] },
      { timelineId: 'draft', target: outer, kf: scene.timelines[1].tracks[1].keyframes[0] },
    ], context).execute(scene)).toThrow()
    expect(() => makeAddKfCmd('main', camera, key, context).execute(scene)).toThrow(/own this Timeline/)
    expect(() => makeAddKfCmd('draft', camera, key).execute(scene)).toThrow(/2D Timeline/)
    expect(JSON.stringify(scene)).toBe(before)
    const next = applyKeyframeBatch(scene, { insertions: [valid] }, { context })
    expect(next.timelines[1].tracks[0].keyframes.some(item => item.id === 'paste')).toBe(true)
  })

  it('adds native content tracks and Auto Keys without changing main-context static behavior', () => {
    const scene = fixture(), context = contentTimelineContext(scene, 'robot', 'draft'), path = 'model3d.position.z'
    const add = makeAddAnimationCmd('draft', 'robot', path, 50, context)
    expect(add.undo(add.execute(scene))).toEqual(scene)
    const next = setAnimatedPropertyValue({ scene, timelineId: 'draft', layerId: 'robot', propertyPath: path,
      value: .5, timeMs: 100, autoKeyframe: true, context })
    expect(next.timelines[1].tracks.find(track => track.target === `layers.robot.${path}`)!.keyframes[0].value).toBe(.5)
    const main = setAnimatedPropertyValue({ scene, timelineId: 'main', layerId: 'robot', propertyPath: path,
      value: .5, timeMs: 100, autoKeyframe: true })
    expect(main.timelines).toBe(scene.timelines)
    expect(() => setAnimatedPropertyValue({ scene, timelineId: 'draft', layerId: 'robot', propertyPath: 'transform.x',
      value: 10, timeMs: 100, autoKeyframe: false, context })).toThrow()
  })

  it('clear and projections retain foreign and outer keys rather than deleting hidden source', () => {
    const scene = fixture(), context = contentTimelineContext(scene, 'robot', 'draft'), timeline = scene.timelines[1]
    const projected = timelineTracksInScope(scene.layers, timeline.tracks, context)
    expect(projected.map(track => track.target)).toEqual([camera])
    const rows = buildTimelineLayerRows(scene.layers, timeline, { context })
    expect(Array.from(rows.eligible)).toEqual(['robot'])
    expect(rows.rows.flatMap(row => row.tracks.map(track => track.target))).toEqual([camera])
    const nodes = buildHierarchy(scene, timeline, false, false, '', null, undefined, context)
    expect(nodes.flatMap(node => node.type === 'property' && node.trackTarget ? [node.trackTarget] : [])).toEqual([camera])
    const plan = prepareClearKeyframes(scene, 'draft', { kind: 'layer', layerId: 'robot' }, context)
    const next = plan.command!.execute(scene)
    expect(next.timelines[1].tracks[0].keyframes).toEqual([])
    expect(next.timelines[1].tracks[1]).toBe(timeline.tracks[1])
    expect(next.timelines[1].tracks[2]).toBe(timeline.tracks[2])
    expect(plan.command!.undo(next)).toEqual(scene)
    expect(navigateTimeline(scene, 'draft', 0, 'lastKey', new Set(), 1, context)).toBe(200)
    expect(() => buildTimelineLayerRows(scene.layers, scene.timelines[0], { context })).toThrow()
  })

  it('public script hosts retain scene scope while an internal host supplies its explicit draft context', () => {
    const scene = fixture(), context = contentTimelineContext(scene, 'robot', 'draft')
    let current = scene
    const host = { getScene: () => current, applyCommand: (command: import('../../editor/commands-keyframe').EditorCommand) => { current = command.execute(current) } }
    const api: ApiContext = { host, resolveTimelineId: () => 'draft' }
    expect(() => new LayerHandle('robot', api).key('model3d.camera.yaw', 100, 30)).toThrow(/2D Timeline/)
    expect(() => new TimelineHandle('draft', api).track(camera, {})).toThrow(/2D Timeline/)
    expect(current).toBe(scene)
    const inner = { ...api, timelineContext: context }
    new LayerHandle('robot', inner).key('model3d.camera.yaw', 100, 30)
    expect(current.timelines[1].tracks[0].keyframes.some(key => key.timeMs === 100 && key.value === 30)).toBe(true)
    expect(() => new TimelineHandle('draft', inner).track(outer, {})).toThrow()
    expect(() => new TimelineHandle('main', inner).track(camera, {})).toThrow()
    expect(() => new TimelineHandle('draft', inner).set({ durationMs: 800 })).toThrow(/lifecycle/)
  })

  it('revalidates missing/replaced owner and Timeline, never persists context or migrates old source', () => {
    const scene = fixture(), context = contentTimelineContext(scene, 'robot', 'draft')
    const edit = makeUpdateKfValueCmd('draft', camera, 'camera-a', 20, 40, context)
    expect(() => edit.execute({ ...scene, layers: scene.layers.filter(layer => layer.id !== 'robot') })).toThrow(/owner/)
    expect(() => makeAddAnimationCmd('draft', 'robot', 'model3d.scale', 100, context)
      .execute({ ...scene, layers: scene.layers.filter(layer => layer.id !== 'robot') })).toThrow(/owner/)
    expect(() => edit.execute({ ...scene, timelines: [scene.timelines[0]] })).toThrow(/no longer exists/)
    expect(parseSceneJson(JSON.stringify(scene), true)).toEqual(scene)
    expect(JSON.stringify(edit.execute(scene))).not.toContain('ownerLayerId')
    expect(scene.formatVersion).toBe('1.0.0')
  })
})
