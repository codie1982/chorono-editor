import { expect, it } from 'vitest'
import { emptyScene, newRectLayer, newTimeline } from '../../defaults'
import { summarizeSourceChanges } from './SourceChangeSummary'

it('reports actual leaf/key/reparent edits and does not mistake detached equal objects for source changes', () => {
  const before = emptyScene(), layer = newRectLayer(), timeline = newTimeline()
  before.layers = [layer]
  timeline.tracks = [{ target: `layers.${layer.id}.opacity`, keyframes: [{ id: 'key', timeMs: 0, value: 1, easing: { type: 'linear' } }] }]
  before.timelines = [timeline]
  expect(summarizeSourceChanges(before, structuredClone(before))).toEqual({ addedLayerIds: [], removedLayerIds: [], reparentedLayerIds: [], changedPaths: [], changedKeys: [], truncated: false })
  const after = structuredClone(before)
  after.layers[0].parentId = 'group'; after.layers[0].opacity = .5
  after.timelines[0].tracks[0].keyframes[0].value = .5
  const summary = summarizeSourceChanges(before, after)
  expect(summary.reparentedLayerIds).toEqual([layer.id])
  expect(summary.changedPaths).toContain(`layers.${layer.id}.opacity`)
  expect(summary.changedKeys).toEqual([{ timelineId: timeline.id, target: timeline.tracks[0].target, keyId: 'key', operation: 'updated' }])
  expect(summary.truncated).toBe(false)
})

it('bounds reports and clearly marks omitted values instead of retaining per-frame or dense JSON data', () => {
  const before = emptyScene(), after = emptyScene()
  after.layers = Array.from({ length: 150 }, () => newRectLayer())
  const summary = summarizeSourceChanges(before, after)
  expect(summary.addedLayerIds).toHaveLength(100)
  expect(summary.truncated).toBe(true)
  expect(JSON.stringify(summary).length).toBeLessThan(20000)
})

it('does not throw after a valid legacy commit just because old keys lack stable identity', () => {
  const before = emptyScene(), timeline = newTimeline()
  timeline.tracks = [{ target: 'composition.width', keyframes: [{ id: undefined as unknown as string, timeMs: 0, value: 1, easing: { type: 'linear' } }] }]
  before.timelines = [timeline]
  const after = structuredClone(before)
  after.timelines[0].tracks[0].keyframes[0].value = 2
  expect(summarizeSourceChanges(before, after).truncated).toBe(true)
})
