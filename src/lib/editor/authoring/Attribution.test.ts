import { describe, expect, it, vi } from 'vitest'
import { emptyScene, newRectLayer, newTextLayer, newSplineLayerFromPrimitive, newTimeline } from '../../defaults'
import type { ChronoScene } from '../../types'
import type { AuthoringStamp } from '../../types/authoring'
import { attributeSourceChange, UNKNOWN_WRITER } from './Attribution'
import { describeAuthoring, fieldAuthoring } from './AuthoringQuery'
import { executeAuthoredCommand } from './AuthoringCommand'
import { authoringKey } from './SourceEntities'
import { assertAuthoringData, AUTHORING_LIMITS } from './AuthoringValidation'
import { AuthoringHintCollector } from './AuthoringHints'
import { makeUpdateKfValueCmd, makePasteKfCmd, makeUpdateEasingCmd } from '../commands-keyframe'
import { makeCloneForestCmd } from '../commands-clone-forest'
import { makeCloneCmd } from '../commands-clone'
import { makeImportAssetsCmd } from '../commands-import'
import { initHistory, pushHistory, undoHistory, redoHistory } from '../history'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'
import { exportToRuntime } from '../../export/runtimeExport'
import { defaultRuntimeExporter } from '../../export/RuntimeExporter'

const agent: AuthoringStamp = { actor: { kind: 'agent', name: 'Hermes' }, transactionId: 'agent-1' }
const human: AuthoringStamp = { actor: { kind: 'human' }, transactionId: 'human-1' }

/** Real source shapes and animation metadata; no copied attribution logic. */
function fixture() {
  const source = emptyScene(), group = { ...newRectLayer(), type: 'group' as const }, clock = newTextLayer()
  const spline = newSplineLayerFromPrimitive('line', { x1: 0, y1: 0, x2: 100, y2: 20 })!
  clock.text = { ...clock.text!, value: '10:10' }; clock.parentId = group.id
  const timeline = newTimeline(), target = `layers.${clock.id}.transform.x`
  timeline.tracks = [{ target, keyframes: [{ id: 'stable-key', timeMs: 0, value: 20,
    easing: { type: 'customBezier', bezier: { cx1: .2, cy1: .1, cx2: .8, cy2: .9 } }, tangentMode: 'aligned' }] }]
  const scene = attributeSourceChange(source, { ...source, layers: [group, clock, spline], timelines: [timeline] }, agent)
  return { source, scene, group, clock, spline, timeline, target }
}

describe('sparse source attribution', () => {
  it('keeps ordinary human commands usable without secure-context UUID and treats orphan records as unknown', () => {
    const { scene, clock } = fixture()
    vi.stubGlobal('crypto', {})
    try {
      const changed = executeAuthoredCommand({ label: 'Human opacity', execute: value => ({ ...value, layers: value.layers.map(layer => layer.id === clock.id ? { ...layer, opacity: .25 } : layer) }), undo: value => value }, scene)
      expect(fieldAuthoring(changed, ['layer', clock.id], ['opacity']).actor.kind).toBe('human')
      const absent = { ...changed, layers: changed.layers.filter(layer => layer.id !== clock.id) }
      expect(describeAuthoring(absent, ['layer', clock.id])).toMatchObject({ origin: 'unknown', createdBy: UNKNOWN_WRITER, lastWriter: UNKNOWN_WRITER })
    } finally { vi.unstubAllGlobals() }
  })

  it('keeps legacy creation unknown and does not use animation parameter names as actor flags', () => {
    const before = emptyScene(), layer = newRectLayer(); before.layers = [layer]
    before.initialState = { hermes: true, authoring: 'user value' }
    const address = ['layer', layer.id] as const
    expect(describeAuthoring(before, address).origin).toBe('unknown')
    const next = attributeSourceChange(before, { ...before, layers: [{ ...layer, opacity: .4 }] }, human)
    expect(next.initialState).toEqual(before.initialState)
    expect(describeAuthoring(next, address).createdBy).toEqual(UNKNOWN_WRITER)
    expect(fieldAuthoring(next, address, ['opacity'])).toEqual(human)
    expect(fieldAuthoring(next, address, ['transform', 'x'])).toEqual(UNKNOWN_WRITER)
  })

  it('separates creation, field writers and child contributions without changing manual values', () => {
    const { scene, clock, group } = fixture(), address = ['layer', clock.id] as const
    const manual = attributeSourceChange(scene, { ...scene, layers: scene.layers.map(layer => layer.id === clock.id ? { ...layer, text: { ...layer.text!, value: '09:05' } } : layer) }, human)
    const updated = attributeSourceChange(manual, { ...manual, layers: manual.layers.map(layer => layer.id === clock.id ? { ...layer, text: { ...layer.text!, color: '#22c55e' } } : layer) }, agent)
    expect(updated.layers.find(layer => layer.id === clock.id)?.text?.value).toBe('09:05')
    expect(describeAuthoring(updated, address)).toMatchObject({ origin: 'mixed', createdBy: agent, lastWriter: agent })
    expect(fieldAuthoring(updated, address, ['text', 'value'])).toEqual(human)
    expect(fieldAuthoring(updated, address, ['text', 'color'])).toEqual(agent)
    expect(describeAuthoring(updated, ['layer', group.id]).origin).toBe('agent')
    expect(describeAuthoring(updated, ['layer', group.id], true).origin).toBe('mixed')
  })

  it('tracks key fields by identity and preserves easing, tangent and manual source during a value edit', () => {
    const { scene, timeline, target } = fixture(), address = ['key', timeline.id, target, 'stable-key'] as const
    const eased = executeAuthoredCommand(makeUpdateEasingCmd(timeline.id, target, 'stable-key', scene.timelines[0].tracks[0].keyframes[0].easing, { type: 'easeOut' }), scene, human)
    const manual = executeAuthoredCommand(makeUpdateKfValueCmd(timeline.id, target, 'stable-key', 20, 40), eased, human)
    const updated = executeAuthoredCommand(makeUpdateKfValueCmd(timeline.id, target, 'stable-key', 40, 55), manual, agent)
    const key = updated.timelines[0].tracks[0].keyframes[0]
    expect(key).toEqual({ ...manual.timelines[0].tracks[0].keyframes[0], value: 55 })
    expect(fieldAuthoring(updated, address, ['value'])).toEqual(agent)
    expect(fieldAuthoring(updated, address, ['easing', 'type'])).toEqual(human)
    expect(describeAuthoring(manual, address)).toMatchObject({ origin: 'mixed', createdBy: agent, lastWriter: human })
  })

  it('uses stable spline point ids and treats index-based legacy geometry as an atomic field', () => {
    const { scene, spline } = fixture(), pointId = Object.keys(spline.spline!.points)[0]
    const moved = attributeSourceChange(scene, { ...scene, layers: scene.layers.map(layer => layer.id !== spline.id ? layer : { ...layer, spline: { ...layer.spline!, points: { ...layer.spline!.points, [pointId]: { ...layer.spline!.points[pointId], x: 91 } } } }) }, human)
    expect(fieldAuthoring(moved, ['spline', spline.id, 'points', pointId], ['x'])).toEqual(human)
    expect(fieldAuthoring(moved, ['spline', spline.id, 'points', pointId], ['y'])).toEqual(agent)
    expect(describeAuthoring(moved, ['layer', spline.id]).origin).toBe('agent')
    expect(describeAuthoring(moved, ['layer', spline.id], true).origin).toBe('mixed')
  })

  it('restores exact attribution through undo/redo and portable JSON rather than restamping undo', () => {
    const { scene, clock } = fixture(), changed = attributeSourceChange(scene, { ...scene, layers: scene.layers.map(layer => layer.id === clock.id ? { ...layer, opacity: .5 } : layer) }, human)
    const history = pushHistory(initHistory(scene), changed)
    expect(undoHistory(history).present).toBe(scene)
    expect(redoHistory(undoHistory(history)).present).toBe(changed)
    expect(parseSceneJson(JSON.stringify(changed), true)).toEqual(changed)
    expect(attributeSourceChange(scene, changed, agent, { mode: 'restore' })).toBe(changed)
  })

  it('ignores forged metadata on ordinary edits and records no writes for detached equal source', () => {
    const { scene } = fixture()
    expect(attributeSourceChange(scene, structuredClone(scene), human).authoring).toEqual(scene.authoring)
    const forged = { ...scene, authoring: undefined }
    expect(attributeSourceChange(scene, forged, human).authoring).toEqual(scene.authoring)
  })

  it('inherits layer, key and spline content on forest/legacy copies while marking new creation separately', () => {
    const { scene, clock, group, timeline, target, spline } = fixture()
    const manual = attributeSourceChange(scene, { ...scene, layers: scene.layers.map(layer => layer.id === clock.id ? { ...layer, text: { ...layer.text!, value: '09:05' } } : layer) }, human)
    const command = makeCloneForestCmd(manual, { sourceIds: [group.id, spline.id], count: 1 })
    const copied = executeAuthoredCommand(command, manual, agent), id = command.idMaps[0][clock.id]
    expect(describeAuthoring(copied, ['layer', id]).createdBy).toEqual(agent)
    expect(fieldAuthoring(copied, ['layer', id], ['text', 'value'])).toEqual(human)
    const track = copied.timelines[0].tracks.find(track => track.target === `layers.${id}.transform.x`)!
    expect(fieldAuthoring(copied, ['key', timeline.id, track.target, track.keyframes[0].id], ['easing'])).toEqual(agent)
    expect(copied.layers.find(layer => layer.id === id)?.parentId).toBe(command.idMaps[0][group.id])
    const legacy = makeCloneCmd({ source: clock, allLayers: manual.layers, timeline, count: 1 })
    const legacyCopy = executeAuthoredCommand(legacy, manual, human)
    expect(fieldAuthoring(legacyCopy, ['layer', legacy.result.createdLayerIds[0]], ['text', 'value'])).toEqual(human)
    expect(manual.timelines[0].tracks[0].target).toBe(target)
  })

  it('keeps imported content distinct from local human creation and carries clipboard key lineage', () => {
    const { source, scene, timeline, target } = fixture(), imported = newRectLayer()
    const next = executeAuthoredCommand(makeImportAssetsCmd([], [imported]), source, human)
    expect(describeAuthoring(next, ['layer', imported.id]).origin).toBe('import')
    const pasted = executeAuthoredCommand(makePasteKfCmd([{ timelineId: timeline.id, target,
      copiedFrom: ['key', timeline.id, target, 'stable-key'], kf: { ...timeline.tracks[0].keyframes[0], id: 'pasted', timeMs: 500 } }]), scene, human)
    expect(fieldAuthoring(pasted, ['key', timeline.id, target, 'pasted'], ['easing'])).toEqual(agent)
    expect(fieldAuthoring(pasted, ['key', timeline.id, target, 'pasted'], ['timeMs'])).toEqual(human)
  })

  it('evicts complete records to unknown at capacity and prunes deleted entity metadata', () => {
    const { scene, clock } = fixture(), large = { ...scene, layers: Array.from({ length: AUTHORING_LIMITS.records + 2 }, () => newRectLayer()) }
    const bounded = attributeSourceChange(scene, large, agent)
    expect(bounded.authoring?.truncated).toBe(true)
    expect(Object.keys(bounded.authoring!.records).length).toBeLessThanOrEqual(AUTHORING_LIMITS.records)
    expect(JSON.stringify(bounded.authoring).length).toBeLessThanOrEqual(AUTHORING_LIMITS.chars)
    expect(bounded.authoring?.records[authoringKey(['layer', clock.id])]).toBeUndefined()
    expect(() => assertAuthoringData(bounded.authoring)).not.toThrow()
  })

  it('rejects invalid persisted metadata and omits only the root ledger in both runtime adapters', () => {
    const { scene } = fixture()
    expect(() => parseSceneJson(JSON.stringify({ ...scene, authoring: { version: 2, records: {} } }), true)).toThrow('authoring')
    const withUserData: ChronoScene = { ...scene, initialState: { authoring: 'user animation value', hermes: true } }
    for (const output of [exportToRuntime(withUserData), defaultRuntimeExporter.export(withUserData).runtime]) {
      expect(output).not.toHaveProperty('authoring')
      expect(JSON.stringify(output)).not.toContain('createdBy')
    }
    expect(exportToRuntime(withUserData).initialState).toEqual(withUserData.initialState)
    expect(scene.authoring?.version).toBe(1)
  })

  it('bounds private lineage and keeps omitted copied content unknown', () => {
    const collector = new AuthoringHintCollector()
    collector.add({ copies: Array.from({ length: AUTHORING_LIMITS.records + 1 }, (_, i) => ({
      from: ['layer', `source-${i}`] as const, to: ['layer', `copy-${i}`] as const,
    })) })
    expect(collector.hints.copies).toHaveLength(AUTHORING_LIMITS.records)
    expect(collector.hints.incomplete).toBe(true)
    const source = emptyScene(), layer = newRectLayer()
    const next = attributeSourceChange(source, { ...source, layers: [layer] }, human, collector.hints)
    expect(describeAuthoring(next, ['layer', layer.id]).createdBy).toEqual(human)
    expect(fieldAuthoring(next, ['layer', layer.id], ['opacity'])).toEqual(UNKNOWN_WRITER)
    expect(next.authoring?.truncated).toBe(true)
  })

  it('does not credit an aggregate value to an old whole-field writer after a nested human edit', () => {
    const input = fixture(), timeline = input.timeline, target = `layers.${input.clock.id}.text.color`
    const scene = attributeSourceChange(emptyScene(), { ...input.scene, timelines: [{ ...timeline, tracks: [{ ...timeline.tracks[0], target }] }] }, agent)
    const address = ['key', timeline.id, target, 'stable-key'] as const
    const colored = executeAuthoredCommand(makeUpdateKfValueCmd(timeline.id, target, 'stable-key', 20, { r: 10, g: 20, b: 30, a: 255 }), scene, agent)
    const manual = executeAuthoredCommand(makeUpdateKfValueCmd(timeline.id, target, 'stable-key', { r: 10, g: 20, b: 30, a: 255 }, { r: 90, g: 20, b: 30, a: 255 }), colored, human)
    expect(fieldAuthoring(manual, address, ['value', 'r'])).toEqual(human)
    expect(fieldAuthoring(manual, address, ['value', 'g'])).toEqual(agent)
    expect(fieldAuthoring(manual, address, ['value'])).toEqual(UNKNOWN_WRITER)
  })
})
