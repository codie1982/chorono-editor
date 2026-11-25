import { describe, expect, it } from 'vitest'
import { emptyScene, newSplineLayerFromData } from '@/lib/defaults'
import { createRectangleSpline, setSegmentType } from '@/lib/spline'
import { moveSplinePoints } from '@/lib/spline/edit/moveSplinePoints'
import { splineEditCommand } from './commands'

function fixture() {
  const scene = emptyScene(), data = createRectangleSpline({ width: 100, height: 60 }), layer = newSplineLayerFromData(data, { x: 100, y: 100, name: 'Editable' })
  scene.layers = [layer]; scene.timelines = [{ id: 'main', durationMs: 1000, autoplay: false, loop: false, tracks: [
    { target: `layers.${layer.id}.transform.x`, keyframes: [{ id: 'human', timeMs: 0, value: 100, easing: { type: 'linear' } }] },
  ] }]
  return { scene, layer, point: Object.keys(data.points)[0], edge: Object.keys(data.segments)[0] }
}
describe('guarded spline sub-object commands', () => {
  it('keeps layer transforms, other records and human keys; one Undo/Redo restores exact source', () => {
    const { scene, layer, point } = fixture(), before = structuredClone(scene)
    const command = splineEditCommand(scene, layer.id, { kind: 'point', ids: [point] }, data => moveSplinePoints(data, [point], 10, 20))!
    const after = command.execute(scene)
    expect(after.timelines).toBe(scene.timelines); expect(after.layers[0].transform).toBe(layer.transform)
    expect(command.undo(after)).toEqual(scene); expect(command.execute(command.undo(after))).toEqual(after)
    expect(scene).toEqual(before)
  })
  it('merges intervening layer metadata and rejects changed geometry instead of overwriting it', () => {
    const { scene, layer, edge } = fixture(), command = splineEditCommand(scene, layer.id, { kind: 'topology' }, data => setSegmentType(data, edge, 'cubic'))!
    const renamed = { ...scene, layers: [{ ...layer, name: 'Human rename' }] }
    expect(command.execute(renamed).layers[0].name).toBe('Human rename')
    expect(() => command.execute({ ...scene, layers: [{ ...layer, spline: structuredClone(layer.spline!) }] })).toThrow('changed')
  })
  it('preserves keyed coordinates by rejecting geometry edits while permitting object metadata', () => {
    const { scene, layer, point, edge } = fixture()
    scene.timelines[0].tracks.push({ target: `layers.${layer.id}.spline.points.${point}.x`, keyframes: [{ id: 'manual', timeMs: 500, value: 40, easing: { type: 'linear' } }] })
    const before = structuredClone(scene)
    expect(() => splineEditCommand(scene, layer.id, { kind: 'point', ids: [point] }, data => moveSplinePoints(data, [point], 1, 0))).toThrow('keyed')
    expect(() => splineEditCommand(scene, layer.id, { kind: 'topology' }, data => setSegmentType(data, edge, 'cubic'))).toThrow()
    const object = Object.keys(layer.spline!.subShapes)[0]
    const metadata = splineEditCommand(scene, layer.id, { kind: 'metadata' }, data => ({ ...data, subShapes: { ...data.subShapes, [object]: { ...data.subShapes[object], name: 'Named' } } }))!.execute(scene)
    expect(metadata.timelines).toEqual(before.timelines); expect(scene).toEqual(before)
  })
  it('rechecks newly added drivers at execution and refuses locked/source-less targets', () => {
    const { scene, layer, point } = fixture(), command = splineEditCommand(scene, layer.id, { kind: 'point', ids: [point] }, data => moveSplinePoints(data, [point], 1, 0))!
    const keyed = structuredClone(scene); keyed.layers = scene.layers; keyed.timelines[0].tracks.push({ target: `layers.${layer.id}.spline.points.${point}.x`, keyframes: [{ id: 'new-driver', timeMs: 0, value: 20, easing: { type: 'linear' } }] })
    expect(() => command.execute(keyed)).toThrow()
    expect(() => splineEditCommand({ ...scene, layers: [{ ...layer, locked: true }] }, layer.id, { kind: 'metadata' }, data => data)).toThrow('editable')
    layer.spline!.points[point].locked = true
    expect(() => splineEditCommand(scene, layer.id, { kind: 'point', ids: [point] }, data => moveSplinePoints(data, [point], 1, 0))).toThrow('Unlock')
    expect(() => splineEditCommand(scene, layer.id, { kind: 'topology' }, data => data)).toThrow('Unlock')
  })
})
