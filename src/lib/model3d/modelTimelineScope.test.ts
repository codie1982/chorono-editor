import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newTimeline } from '../defaults'
import type { ChronoScene, Keyframe } from '../types'
import { modelDefinition } from './source/modelDefinition'
import { newModelLayer } from './source/modelDefaults'
import { keyableChannels } from '../timeline/authoring/keyableChannels'
import { prepareSetKey } from '../timeline/authoring/setKey'
import { prepareClearKeyframes } from '../timeline/authoring/clearKeyframes'
import { navigateTimeline } from '../timeline/authoring/timelineNavigation'
import { makeAddAnimationCmd } from '../timeline/addAnimationCommand'
import { makeAddKfCmd, makeBulkDeleteKfCmd, makePasteKfCmd, type EditorCommand } from '../editor/commands-keyframe'
import { setAnimatedPropertyValue } from '../editor/autoKeyframe'
import { makeSetTrackControllerCmd } from '../editor/commands-track'
import { DEFAULT_WAVEFORM_PARAMS } from '../types'
import { LayerHandle } from '../script/api/LayerHandle'
import { TimelineHandle } from '../script/api/TimelineHandle'
import { buildTimelineLayerRows } from '../timeline/hierarchy/timelineLayerRows'
import { buildHierarchy } from '../dope-sheet/hierarchy-builder'
import { flattenDopeSheetRows } from '../dope-sheet/rows'
import { timelineTracksInScope } from '../timeline/authoring/timelinePropertyScope'
import { parseSceneJson } from '../format/scene/SceneJsonConverter'
import { evaluateSceneFrame } from '../runtime/evaluateSceneFrame'

const key = (id: string, timeMs: number, value: number): Keyframe => ({ id, timeMs, value, easing: { type: 'linear' }, tangentMode: 'aligned' })
/** Legacy internal tracks model a saved first-slice project, not a newly allowed
 * authoring path. Every test borrows independent source and real command adapters. */
function fixture(): ChronoScene {
  return { ...emptyScene(), layers: [newModelLayer('model', 'asset')], timelines: [{ ...newTimeline(), id: 'active', durationMs: 1000,
    layerIds: ['model'], tracks: [{ target: 'layers.model.transform.x', keyframes: [key('outer', 300, 40)] },
      { target: 'layers.model.model3d.camera.yaw', keyframes: [key('camera-a', 0, 30), key('camera-b', 800, 60)] }] }] }
}

describe('boxed model outer 2D Timeline scope', () => {
  it('retains static positioning controls but excludes internal channels from every Set Key mode', () => {
    const scene = fixture(), layer = scene.layers[0]
    const internal = modelDefinition.getPropertyGroups(layer).flatMap(group => group.schemas).filter(schema => schema.path.startsWith('model3d.'))
    expect(internal.length).toBeGreaterThan(10)
    expect(internal.every(schema => !schema.animatable)).toBe(true)
    const channels = keyableChannels(layer, scene.timelines[0].tracks, 'all', new Set()).map(channel => channel.path)
    expect(channels.sort()).toEqual(['opacity', 'transform.x', 'transform.y', 'transform.rotationDeg', 'transform.scaleX', 'transform.scaleY'].sort())
    for (const mode of ['all', 'animated', 'selected'] as const) {
      const plan = prepareSetKey(scene, { timelineId: 'active', layerIds: ['model'], timeMs: 500, keyset: mode,
        selectedTargets: new Set(['layers.model.model3d.camera.yaw']) })
      expect(plan.targets.some(target => target.includes('.model3d.'))).toBe(false)
      if (plan.command) {
        const next = plan.command.execute(scene)
        expect(next.timelines[0].tracks.find(track => track.target.includes('.model3d.'))).toBe(scene.timelines[0].tracks[1])
        expect(plan.command.undo(next)).toEqual(scene)
      }
    }
  })

  it('changes static Properties with Auto Key on without touching any internal key', () => {
    const scene = fixture(), before = JSON.stringify(scene)
    const next = setAnimatedPropertyValue({ scene, layerId: 'model', propertyPath: 'model3d.position.z', value: .25,
      timelineId: 'active', timeMs: 500, autoKeyframe: true })
    expect(next.layers[0].model3d!.position.z).toBe(.25)
    expect(next.timelines).toBe(scene.timelines)
    expect(JSON.stringify(scene)).toBe(before)
    const outer = setAnimatedPropertyValue({ scene, layerId: 'model', propertyPath: 'transform.y', value: 80,
      timelineId: 'active', timeMs: 500, autoKeyframe: true })
    expect(outer.timelines[0].tracks.find(track => track.target === 'layers.model.transform.y')!.keyframes[0].value).toBe(80)
  })

  it('rejects explicit native and script key creation before publishing a change', () => {
    const scene = fixture(), before = JSON.stringify(scene), target = 'layers.model.model3d.camera.yaw'
    expect(() => makeAddAnimationCmd('active', 'model', 'model3d.rotation.y', 500).execute(scene)).toThrow(/2D Timeline/)
    expect(() => makeAddKfCmd('active', target, key('new', 500, 20)).execute(scene)).toThrow(/2D Timeline/)
    expect(() => makeSetTrackControllerCmd('active', target, undefined, { type: 'waveform', waveform: DEFAULT_WAVEFORM_PARAMS }).execute(scene)).toThrow(/2D Timeline/)
    let current = scene
    const context = { resolveTimelineId: () => 'active', host: {
      getScene: () => current, applyCommand: (command: EditorCommand) => { current = command.execute(current) },
    } }
    const handle = new LayerHandle('model', context), timeline = new TimelineHandle('active', context)
    expect(() => handle.key('model3d.camera.yaw', 500, 50)).toThrow(/2D Timeline/)
    expect(() => timeline.track(target, { keyframes: [key('api', 500, 50)] })).toThrow(/2D Timeline/)
    expect(() => timeline.removeTrack(target)).toThrow(/2D Timeline/)
    expect(current).toBe(scene); expect(JSON.stringify(scene)).toBe(before)
    handle.key('transform.y', 500, 50)
    expect(current.timelines[0].tracks.find(track => track.target === 'layers.model.transform.y')!.keyframes[0].value).toBe(50)
  })

  it('shares the same hidden internal scope across Timeline, Curve and Dope Sheet projections and navigation', () => {
    const scene = fixture(), timeline = scene.timelines[0], before = JSON.stringify(scene)
    const rows = buildTimelineLayerRows(scene.layers, timeline).rows
    expect(rows[0].tracks.map(track => track.target)).toEqual(['layers.model.transform.x'])
    const sheet = flattenDopeSheetRows(buildHierarchy(scene, timeline, false, false, '', null), timeline, new Set())
    expect(sheet[0].tracks.map(track => track.target)).toEqual(['layers.model.transform.x'])
    expect(timelineTracksInScope(scene.layers, timeline.tracks)).toEqual([timeline.tracks[0]])
    expect(navigateTimeline(scene, 'active', 300, 'nextKey', new Set(['model']))).toBe(300)
    expect(JSON.stringify(scene)).toBe(before)
  })

  it('preserves hidden keys during clear, save/open, legacy evaluation and undo; mixed edits fail atomically', () => {
    const scene = fixture(), internal = scene.timelines[0].tracks[1]
    const plan = prepareClearKeyframes(scene, 'active', { kind: 'layer', layerId: 'model' })
    const next = plan.command!.execute(scene)
    expect(next.timelines[0].tracks[0].keyframes).toEqual([])
    expect(next.timelines[0].tracks[1]).toBe(internal)
    expect(plan.command!.undo(next)).toEqual(scene)
    const loaded = parseSceneJson(JSON.stringify(scene), true)
    expect(loaded.timelines).toEqual(scene.timelines)
    expect(evaluateSceneFrame(loaded, 400).overrides.get(internal.target)).toBe(45)
    expect(() => makeBulkDeleteKfCmd([{ timelineId: 'active', target: internal.target, kf: internal.keyframes[0] }]).execute(scene)).toThrow(/2D Timeline/)
    expect(() => makePasteKfCmd([{ timelineId: 'active', target: scene.timelines[0].tracks[0].target, kf: key('outer-new', 500, 70) },
      { timelineId: 'active', target: internal.target, kf: key('inner-new', 500, 70) }]).execute(scene)).toThrow(/2D Timeline/)
    expect(scene.timelines[0].tracks[0].keyframes).toHaveLength(1)
  })

  it('retains old 2D custom-channel behavior and track array identities', () => {
    const layer = { ...newRectLayer(), id: 'shape' }, tracks = [{ target: 'layers.shape.transform.x', keyframes: [key('x', 0, 10)] }]
    expect(timelineTracksInScope([layer], tracks)).toBe(tracks)
    const scene = { ...emptyScene(), layers: [layer], timelines: [{ ...newTimeline(), id: 'active', tracks }] }
    expect(() => makeAddAnimationCmd('active', 'shape', 'opacity', 0).execute(scene)).not.toThrow()
  })
})
