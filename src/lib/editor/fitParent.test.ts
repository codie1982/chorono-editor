import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newTimeline } from '../defaults'
import { buildFitParentCommand } from './fitParent'
import { createLayerWorldBoundsResolver } from '../geometry/resolveLayerWorldBounds'
import { resolveLayerWorldMatrix } from '../geometry/resolveLayerWorldMatrix'

function fixture() {
  const scene = emptyScene(), parent = { ...newRectLayer(), id: 'parent', size: { width: 400, height: 250 } }
  parent.transform = { ...parent.transform, x: 80, y: 40, rotationDeg: 37, scaleX: 1.5, scaleY: -.7 }
  const child = { ...newRectLayer(), id: 'child', parentId: parent.id, size: { width: 80, height: 50 } }
  child.transform = { ...child.transform, x: 27, y: 35, anchorX: 13, anchorY: 19 }
  scene.layers = [parent, child]
  scene.timelines = [{ ...newTimeline(), id: 'active', tracks: [] }]
  return scene
}
const options = { timelineId: 'active', timeMs: 0, autoKeyframe: false }

describe('Fit Parent uses shared evaluated transforms and animation commands', () => {
  it('fits an anchored child in a rotated/reflected/nonuniform parent without changing either geometry or parent', () => {
    const scene = fixture(), before = JSON.stringify(scene), command = buildFitParentCommand(scene, ['child'], options)!
    const next = command.execute(scene), inverse = resolveLayerWorldMatrix(next.layers[0], next, 0).invert()
    const box = createLayerWorldBoundsResolver(next, 0, undefined, { worldToSpace: inverse })(next.layers[1])!
    expect(box.x).toBeCloseTo(0); expect(box.y).toBeCloseTo(0)
    expect(box.width).toBeCloseTo(400); expect(box.height).toBeCloseTo(250)
    expect(createLayerWorldBoundsResolver(next, 0, undefined, { worldToSpace: inverse, deferPreparation: true })(next.layers[1])).toEqual(box)
    expect(next.layers[0]).toBe(scene.layers[0]); expect(next.layers[1].size).toBe(scene.layers[1].size)
    expect(next.layers[1].transform.anchorX).toBe(13); expect(next.layers[1].parentId).toBe('parent')
    expect(JSON.stringify(scene)).toBe(before); expect(command.undo(next)).toEqual(scene)
  })
  it('fits unparented content to composition and treats selected parent/child as one root', () => {
    const scene = fixture(); scene.layers[0].transform.rotationDeg = 0
    const next = buildFitParentCommand(scene, ['parent', 'child'], options)!.execute(scene)
    const box = createLayerWorldBoundsResolver(next)(next.layers[0])!
    expect(box.width).toBeCloseTo(scene.composition.width)
    expect(box.height).toBeCloseTo(scene.composition.height)
    expect(next.layers[1]).toBe(scene.layers[1])
  })
  it('preserves existing key IDs/easing and other timelines while keying the fitted pose in one command', () => {
    const scene = fixture(), start = { id: 'manual', timeMs: 0, value: 27, easing: { type: 'hold' as const } }
    scene.timelines[0].tracks = [{ target: 'layers.child.transform.x', keyframes: [start, { ...start, id: 'end', timeMs: 1000, value: 100 }] }]
    const other = { ...newTimeline(), id: 'other', tracks: [] }; scene.timelines.push(other)
    const command = buildFitParentCommand(scene, ['child'], options)!, next = command.execute(scene)
    expect(next.timelines[0].tracks[0].keyframes[0]).toMatchObject({ id: 'manual', easing: { type: 'hold' } })
    expect(next.timelines[0].tracks[0].keyframes[1]).toBe(scene.timelines[0].tracks[0].keyframes[1])
    expect(next.timelines[1]).toBe(other); expect(command.undo(next)).toEqual(scene)
  })
  it('rejects locked, zero-area and nonrepresentable shear targets atomically', () => {
    const scene = fixture(); scene.layers[1].locked = true
    expect(() => buildFitParentCommand(scene, ['child'], options)).toThrow(/locked|lock/i)
    scene.layers[1].locked = false; scene.layers[1].size!.height = 0
    expect(() => buildFitParentCommand(scene, ['child'], options)).toThrow()
    scene.layers[1].size!.height = 50; scene.layers[1].transform.rotationDeg = 35
    expect(() => buildFitParentCommand(scene, ['child'], options)).toThrow(/shear|represent/i)
    expect(buildFitParentCommand(scene, [], options)).toBeNull()
  })
})
