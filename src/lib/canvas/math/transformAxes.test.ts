import { describe, expect, it } from 'vitest'
import { Matrix2D } from '@/lib/geometry/Matrix2D'
import { emptyScene, newRectLayer } from '@/lib/defaults'
import { constrainAxisDelta, transformAxisFrame } from './transformAxes'
import { prepareTransformTargets, scaleTransformTargets } from './preparedTransforms'

describe('shared Scene / Local axes', () => {
  const matrix = Matrix2D.rotation(37).scale(1.7, .8).rotate(19).scale(-2, 3)
  it('normalizes actual local columns including hierarchy shear and reflection', () => {
    const axes = transformAxisFrame('local', matrix)
    expect(Math.hypot(axes.a, axes.b)).toBeCloseTo(1)
    expect(Math.hypot(axes.c, axes.d)).toBeCloseTo(1)
    expect(axes.a * matrix.b - axes.b * matrix.a).toBeCloseTo(0)
    expect(axes.c * matrix.d - axes.d * matrix.c).toBeCloseTo(0)
    expect(Math.sign(axes.determinant())).toBe(Math.sign(matrix.determinant()))
    expect(transformAxisFrame('scene', matrix)).toEqual(Matrix2D.identity())
  })
  it.each(['scene', 'local'] as const)('locks X and Shift Y in %s coordinates without changing sensitivity', space => {
    const axes = transformAxisFrame(space, matrix), delta = axes.applyToVector({ x: 40, y: 9 })
    const x = constrainAxisDelta(delta, 'x', false, axes), expected = axes.applyToVector({ x: 40, y: 0 })
    expect(x.dx).toBeCloseTo(expected.x); expect(x.dy).toBeCloseTo(expected.y)
    const shift = constrainAxisDelta(axes.applyToVector({ x: 4, y: 32 }), null, true, axes)
    const y = axes.applyToVector({ x: 0, y: 32 })
    expect(shift.axis).toBe('y'); expect(shift.dx).toBeCloseTo(y.x); expect(shift.dy).toBeCloseTo(y.y)
    const free = constrainAxisDelta(delta, null, false, axes)
    expect(free.dx).toBeCloseTo(delta.x); expect(free.dy).toBeCloseTo(delta.y)
  })
  it('uses Scene for singular or non-finite reference axes', () => {
    expect(transformAxisFrame('local', Matrix2D.scale(0, 2))).toEqual(Matrix2D.identity())
    expect(transformAxisFrame('local', Matrix2D.rotation(NaN))).toEqual(Matrix2D.identity())
  })
  it('scales local X under a rotated/nonuniform parent and preserves pivot and rotation', () => {
    const parent = { ...newRectLayer(), id: 'parent', type: 'group' as const }
    parent.transform = { ...parent.transform, rotationDeg: 31, scaleX: 1.7, scaleY: .8 }
    const child = { ...newRectLayer(), id: 'child', parentId: parent.id }
    child.transform = { ...child.transform, rotationDeg: 29, scaleX: -1.2, scaleY: .7 }
    const scene = { ...emptyScene(), layers: [parent, child] }, saved = structuredClone(scene)
    const prepared = prepareTransformTargets(scene, [child.id], 0)
    if (!prepared.ok) throw new Error(prepared.reason)
    const target = prepared.activeTarget
    const result = scaleTransformTargets(prepared.targets, target.worldPivot, 2, 1, transformAxisFrame('local', target.worldMatrix))
    if (!result.ok) throw new Error(result.reason)
    expect(result.changes[0].transform).toEqual({ ...child.transform, scaleX: child.transform.scaleX * 2 })
    expect(scene).toEqual(saved)
  })
  it('distinguishes Scene X from Local X on a quarter-turned object', () => {
    const layer = newRectLayer(); layer.transform.rotationDeg = 90
    const prepared = prepareTransformTargets({ ...emptyScene(), layers: [layer] }, [layer.id], 0)
    if (!prepared.ok) throw new Error(prepared.reason)
    for (const space of ['scene', 'local'] as const) {
      const result = scaleTransformTargets(prepared.targets, prepared.pivot, 2, 1, transformAxisFrame(space, prepared.activeTarget.worldMatrix))
      if (!result.ok) throw new Error(result.reason)
      expect(result.changes[0].transform.scaleX).toBeCloseTo(space === 'local' ? 2 : 1)
      expect(result.changes[0].transform.scaleY).toBeCloseTo(space === 'scene' ? 2 : 1)
    }
  })
})
