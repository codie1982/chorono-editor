import { describe, expect, it, vi } from 'vitest'
import { emptyScene, newRectLayer, newBezierPathLayer, newTimeline } from '../../defaults'
import { newModelLayer } from '../../model3d/source/modelDefaults'
import type { ChronoScene } from '../../types'
import { initHistory, pushHistory, undoHistory, redoHistory } from '../history'
import { limitHistory } from '../history/historyBudget'
import { executeAuthoredCommand } from '../authoring'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'
import { moveAnchor } from '../../path/pathOps'
import { ItemDetailRegistry, ItemDetailSession, itemDetailRegistry, detailUnavailableReason, detailDrivenReason } from './index'

/** Parent, child and outer animation are independent sentinels for content
 * scope preservation. IDs, track/key objects and ordering must stay stable. */
function fixture(): ChronoScene {
  const parent = { ...newRectLayer(), id: 'parent', type: 'group' as const, transform: { ...newRectLayer().transform, rotationDeg: 35, scaleX: 2 } }
  const shape = { ...newRectLayer(), id: 'shape', parentId: parent.id, name: 'Editable shape' }
  const child = { ...newRectLayer(), id: 'child', parentId: shape.id }
  return { ...emptyScene(), layers: [parent, shape, child], timelines: [{ ...newTimeline(), id: 'main', layerIds: ['shape'],
    tracks: [{ target: 'layers.shape.transform.x', keyframes: [{ id: 'manual-key', timeMs: 500, value: 80, easing: { type: 'linear' } }] }] }] }
}
const open = (scene: ChronoScene, id = 'shape', revision = 7, signal = new AbortController().signal) => new ItemDetailSession(scene, revision, signal, id)

describe('common item detail ownership and atomic commit', () => {
  it('discovers existing shape/path/model capabilities without advertising media or changing their definitions', () => {
    expect(itemDetailRegistry.find(newRectLayer())?.id).toBe('shape')
    expect(itemDetailRegistry.find(newBezierPathLayer())?.id).toBe('path')
    expect(itemDetailRegistry.find(newModelLayer('m'))?.id).toBe('model3d')
    expect(detailUnavailableReason({ ...newRectLayer(), type: 'image' })).toContain('not available')
    expect(detailUnavailableReason({ ...newRectLayer(), locked: true })).toContain('Unlock')
    expect(detailUnavailableReason({ ...newRectLayer(), instanceOf: 'source' })).toContain('source item')
    const groups = itemDetailRegistry.find(newModelLayer('m'))!.groups(newModelLayer('m'))
    expect(groups.flatMap(group => group.schemas).every(schema => schema.path.startsWith('model3d.'))).toBe(true)
  })

  it('accepts an independently supplied adapter; duplicate registration fails instead of replacing its contract', () => {
    const registry = new ItemDetailRegistry(), base = itemDetailRegistry.find(newRectLayer())!
    const custom = { ...base, id: 'custom', validate: vi.fn() }
    registry.register(custom)
    expect(() => registry.register(custom)).toThrow('Duplicate')
    const scene = fixture(), session = new ItemDetailSession(scene, 0, new AbortController().signal, 'shape', registry)
    session.validate(scene.layers[1])
    expect(custom.validate).toHaveBeenCalledOnce()
  })

  it('applies only content, preserving parent/child/transform/key/reference identity and manual attribution', () => {
    const source = fixture(), session = open(source), before = JSON.stringify(source)
    const draft = { ...source, layers: source.layers.map(layer => layer.id === 'shape' ? { ...layer, size: { width: 180, height: 90 } } : layer) }
    const command = session.prepareApply(draft, source, 7, session.document)!
    expect(JSON.stringify(source)).toBe(before)
    const next = executeAuthoredCommand(command, source)
    expect(next.layers[1].size).toEqual({ width: 180, height: 90 })
    expect(next.layers[1].transform).toBe(source.layers[1].transform)
    expect(next.layers[0]).toBe(source.layers[0]); expect(next.layers[2]).toBe(source.layers[2])
    expect(next.timelines).toBe(source.timelines); expect(next.assets).toBe(source.assets)
    expect(next.layers[1].parentId).toBe('parent'); expect(next.authoring).toBeDefined()
    expect(command.undo(next).layers[1]).toBe(source.layers[1])
  })

  it('produces one main Undo/Redo step and a portable result; no-op Apply and Cancel do not create commands', () => {
    const source = fixture(), session = open(source)
    expect(session.prepareApply(source, source, 7, session.document)).toBeNull()
    const draft = { ...source, layers: source.layers.map(layer => layer.id === 'shape' ? { ...layer, size: { width: 140, height: 110 } } : layer) }
    const command = session.prepareApply(draft, source, 7, session.document)!
    const history = pushHistory(initHistory(source), executeAuthoredCommand(command, source))
    expect(history.past).toHaveLength(1)
    expect(undoHistory(history).present).toBe(source)
    expect(redoHistory(undoHistory(history)).present).toBe(history.present)
    expect(parseSceneJson(JSON.stringify(history.present)).layers[1].size).toEqual({ width: 140, height: 110 })
    session.close(); expect(() => session.validate(draft.layers[1])).toThrow('closed')
    expect(source.layers[1].size).not.toEqual(draft.layers[1].size)
  })

  it('refuses hierarchy, identity, transform, opacity and another item or timeline edits atomically', () => {
    const source = fixture(), session = open(source)
    for (const patch of [{ parentId: 'child' }, { id: 'other' }, { opacity: .3 }, { transform: { ...source.layers[1].transform, x: 45 } }]) {
      expect(() => session.validate({ ...source.layers[1], ...patch })).toThrow('cannot change')
    }
    expect(() => session.prepareApply({ ...source, layers: source.layers.map((layer, i) => i === 2 ? { ...layer, name: 'Changed child' } : layer) }, source, 7, session.document)).toThrow('another scene item')
    expect(() => session.prepareApply({ ...source, timelines: [] }, source, 7, session.document)).toThrow('outside this content')
  })

  it('checks revision, document replacement, active gesture, disposal and the final execute CAS', () => {
    const source = fixture(), controller = new AbortController(), session = open(source, 'shape', 7, controller.signal)
    expect(() => session.assertCurrent(8, controller.signal)).toThrow('scene changed')
    expect(() => session.assertCurrent(7, new AbortController().signal)).toThrow('no longer active')
    expect(() => session.assertCurrent(7, controller.signal, true)).toThrow('pointer gesture')
    const draft = { ...source, layers: source.layers.map(layer => layer.id === 'shape' ? { ...layer, size: { width: 150, height: 100 } } : layer) }
    const command = session.prepareApply(draft, source, 7, controller.signal)!
    expect(() => command.execute({ ...source })).toThrow('stale')
    controller.abort(); expect(() => command.execute(source)).toThrow('stale')
    expect(() => session.assertCurrent(7, controller.signal)).toThrow('no longer active')
  })

  it('protects animated and bound content roots while keeping outer animation untouched', () => {
    const source = fixture(), animated = { ...source, timelines: [{ ...source.timelines[0], tracks: [...source.timelines[0].tracks,
      { target: 'layers.shape.size.width', keyframes: [{ id: 'size-key', timeMs: 0, value: 120, easing: { type: 'linear' as const } }] }] }] }
    const session = open(animated)
    expect(detailDrivenReason(animated, session.layer, 'size')).toContain('animation')
    expect(() => session.validate({ ...session.layer, size: { width: 190, height: 80 } })).toThrow('animation')
    const bound = { ...source.layers[1], paramBindings: { 'style.fill': 'theme' } }
    const linked = { ...source, layers: [source.layers[0], bound, source.layers[2]] }, linkedSession = open(linked)
    expect(detailDrivenReason(linked, bound, 'style')).toContain('binding')
    expect(() => linkedSession.validate({ ...bound, style: { ...bound.style!, fill: { type: 'solid', color: '#ff0000' } } })).toThrow('binding')
    expect(() => linkedSession.validate({ ...bound, size: { width: 160, height: 90 } })).not.toThrow()
  })

  it('validates model placement without changing its asset, outer box or saved inner tracks', () => {
    const model = newModelLayer('model', 'robot'), source = { ...fixture(), layers: [newModelLayer('model', 'robot')] }
    const session = open(source, 'model'), next = { ...model, model3d: { ...model.model3d!, position: { x: 1, y: 2, z: 3 } } }
    expect(session.validate(next).model3d?.position).toEqual({ x: 1, y: 2, z: 3 })
    expect(() => session.validate({ ...model, model3d: { ...model.model3d!, scale: NaN } })).toThrow()
    expect(() => session.validate({ ...model, model3d: { ...model.model3d!, assetId: 'replacement' } })).toThrow('source asset')
    expect(() => session.validate({ ...model, size: { width: 800, height: 800 } })).toThrow('cannot change size')
  })

  it('reuses local point movement with handle preservation and retains the original path on Cancel', () => {
    const path = { ...newBezierPathLayer(), id: 'path', path: { closed: false, anchors: [{ x: 10, y: 20, outX: 20, outY: 20, pointType: 'smooth' as const }] } }
    const source = { ...fixture(), layers: [path] }, session = open(source, 'path')
    const next = { ...path, path: moveAnchor(path.path, 0, 5, 8) }
    session.validate(next)
    expect(next.path.anchors[0]).toMatchObject({ x: 15, y: 28, outX: 25, outY: 28 })
    expect(path.path.anchors[0]).toMatchObject({ x: 10, y: 20 })
    expect(() => session.validate({ ...path, path: { ...path.path, anchors: [{ x: Infinity, y: 1 }] } })).toThrow('coordinate')
  })

  it('uses existing history budgeting to retain at most the detail policy steps', () => {
    let history = initHistory(fixture())
    for (let i = 0; i < 35; i++) history = pushHistory(history, { ...history.present, layers: history.present.layers.map(layer => layer.id === 'shape'
      ? { ...layer, size: { width: 100 + i, height: 80 } } : layer) })
    const bounded = limitHistory(history, { maxSteps: 20, maxBytes: 16 * 1024 ** 2, maxNodes: 100000 })
    expect(bounded.retainedSteps).toBe(20)
    expect(bounded.estimatedBytes).toBeLessThan(16 * 1024 ** 2)
  })
})
