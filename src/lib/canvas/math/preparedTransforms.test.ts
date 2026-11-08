import { describe, expect, it } from 'vitest'
import type { ChronoScene, Layer, Transform } from '@/lib/types'
import { emptyScene } from '@/lib/defaults'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import {
  prepareTransformTargets, translateTransformTargets, rotateTransformTargets, scaleTransformTargets,
  type TransformChange,
} from './preparedTransforms'

/** Small static fixture with a deliberately off-center local anchor. */
function layer(id: string, transform: Partial<Transform> = {}, parentId?: string): Layer {
  return { id, name: id, type: 'shape', opacity: 1, size: { width: 80, height: 40 }, parentId,
    transform: { x: 10, y: 20, anchorX: 5, anchorY: -3, rotationDeg: 0, scaleX: 1, scaleY: 1, ...transform } }
}

/** Apply returned source transforms to a fresh static scene for renderer parity. */
function apply(scene: ChronoScene, changes: readonly TransformChange[]): ChronoScene {
  return { ...scene, layers: scene.layers.map(item => {
    const change = changes.find(candidate => candidate.id === item.id)
    return change ? { ...item, transform: change.transform } : item
  }) }
}

describe('prepared viewport transform targets', () => {
  it('keeps authored root order, excludes selected descendants, and uses root-pivot bounds', () => {
    const parent = layer('parent', { x: 100, y: 50, anchorX: 0, anchorY: 0 })
    const child = layer('child', { x: 1000 }, parent.id)
    const other = layer('other', { x: 300, y: 150, anchorX: 0, anchorY: 0 })
    const scene = { ...emptyScene(), layers: [parent, child, other] }
    const result = prepareTransformTargets(scene, [other.id, child.id, parent.id, other.id], 0)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.targets.map(target => target.id)).toEqual(['parent', 'other'])
    expect(result.pivot).toEqual({ x: 200, y: 100 })
    const active = prepareTransformTargets(scene, [parent.id, child.id, other.id], 0, undefined,
      { pivotMode: 'active', activeId: child.id })
    expect(active.ok && active.pivot).toEqual({ x: 100, y: 50 })
    const moved = translateTransformTargets(result.targets, { x: 12, y: 8 })
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    const after = apply(scene, moved.changes)
    expect(after.layers[1]).toBe(child)
    const beforePoint = resolveLayerWorldMatrix(child, scene).applyToPoint({ x: 0, y: 0 })
    const afterPoint = resolveLayerWorldMatrix(child, after).applyToPoint({ x: 0, y: 0 })
    expect(afterPoint.x - beforePoint.x).toBeCloseTo(12)
    expect(afterPoint.y - beforePoint.y).toBeCloseTo(8)
  })

  it('moves a displayed keyed pose through an animated anisotropic parent without jumping', () => {
    const parent = layer('parent', { x: 100, y: 50, rotationDeg: 90, scaleX: 2, scaleY: 3, anchorX: 0, anchorY: 0 })
    const child = layer('child', { anchorY: 7 }, parent.id)
    const scene = { ...emptyScene(), layers: [parent, child] }
    const frame = new Map([['layers.parent.transform.x', 300], ['layers.child.transform.x', 40], ['layers.child.transform.rotationDeg', 25]])
    const result = prepareTransformTargets(scene, [child.id], 500, frame)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.targets[0].transform.x).toBe(40)
    expect(result.targets[0].transform.rotationDeg).toBe(25)
    expect(result.pivot.x).toBeCloseTo(219)
    expect(result.pivot.y).toBeCloseTo(140)
    const moved = translateTransformTargets(result.targets, { x: 12, y: 8 })
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    expect(moved.changes[0].transform.x).toBeCloseTo(44)
    expect(moved.changes[0].transform.y).toBeCloseTo(16)
    expect(moved.changes[0].transform.rotationDeg).toBe(25)
    expect(child.transform.x).toBe(10)
    expect(parent.transform.x).toBe(100)
  })

  it('uses nested reflected parent axes for a child selected without its ancestors', () => {
    const grand = layer('grand', { x: 40, y: 70, rotationDeg: 30, scaleX: -2, scaleY: 0.5 })
    const parent = layer('parent', { rotationDeg: -20, scaleX: 3, scaleY: 2 }, grand.id)
    const child = layer('child', { rotationDeg: 15 }, parent.id)
    const scene = { ...emptyScene(), layers: [grand, parent, child] }
    const result = prepareTransformTargets(scene, new Set([child.id]), 0)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const moved = translateTransformTargets(result.targets, { x: -31, y: 17 })
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    const after = apply(scene, moved.changes)
    for (const point of [{ x: 0, y: 0 }, { x: 80, y: 40 }, { x: 5, y: -3 }]) {
      const a = resolveLayerWorldMatrix(child, scene).applyToPoint(point)
      const b = resolveLayerWorldMatrix(after.layers[2], after).applyToPoint(point)
      expect(b.x - a.x).toBeCloseTo(-31)
      expect(b.y - a.y).toBeCloseTo(17)
    }
  })

  it('evaluates ordinary root and parent position keys at the captured composition time', () => {
    const parent = layer('parent', { anchorX: 0, anchorY: 0 }), child = layer('child', {}, parent.id)
    const scene: ChronoScene = { ...emptyScene(), layers: [parent, child], timelines: [{
      id: 'motion', durationMs: 1000, autoplay: false, loop: false, tracks: [
        { target: 'layers.parent.transform.x', keyframes: [
          { id: 'parent-start', timeMs: 0, value: 100, easing: { type: 'linear' } },
          { id: 'parent-end', timeMs: 1000, value: 200, easing: { type: 'linear' } },
        ] },
        { target: 'layers.child.transform.x', keyframes: [
          { id: 'child-start', timeMs: 0, value: 20, easing: { type: 'linear' } },
          { id: 'child-end', timeMs: 1000, value: 50, easing: { type: 'linear' } },
        ] },
      ],
    }] }
    const result = prepareTransformTargets(scene, [child.id], 500)
    if (!result.ok) throw new Error(result.reason)
    expect(result.targets[0].transform.x).toBeCloseTo(35)
    expect(result.pivot.x).toBeCloseTo(190)
    const moved = translateTransformTargets(result.targets, { x: 10, y: 0 })
    if (!moved.ok) throw new Error(moved.reason)
    expect(moved.changes[0].transform.x).toBeCloseTo(45)
    expect(child.transform.x).toBe(10)
    expect(scene.timelines[0].tracks[1].keyframes.map(key => key.value)).toEqual([20, 50])
  })

  it('rotates a keyed pose without changing baseline position/scale or mutating source keys', () => {
    const item = layer('keyed', { x: 0, scaleX: 1, scaleY: 1, rotationDeg: 10 })
    const scene: ChronoScene = { ...emptyScene(), layers: [item], timelines: [{
      id: 'motion', durationMs: 1000, autoplay: false, loop: false,
      tracks: ['x', 'scaleX', 'scaleY'].map((property, index) => ({
        target: `layers.keyed.transform.${property}`,
        keyframes: [
          { id: `${property}-start`, timeMs: 0, value: index ? 1 : 0, easing: { type: 'linear' } },
          { id: `${property}-end`, timeMs: 1000, value: index ? 2 : 100, easing: { type: 'linear' } },
        ],
      })),
    }] }
    const before = structuredClone(scene)
    const prepared = prepareTransformTargets(scene, [item.id], 500)
    if (!prepared.ok) throw new Error(prepared.reason)
    const baseline = prepared.targets[0].transform
    expect(baseline.x).toBe(50)
    expect(baseline.scaleX).toBe(1.5)
    const result = rotateTransformTargets(prepared.targets, prepared.pivot, 30)
    if (!result.ok) throw new Error(result.reason)
    const pose = result.changes[0].transform
    expect(pose.x).toBe(baseline.x)
    expect(pose.y).toBe(baseline.y)
    expect(pose.scaleX).toBe(baseline.scaleX)
    expect(pose.scaleY).toBe(baseline.scaleY)
    expect(pose.rotationDeg).toBeCloseTo(40)
    expect(scene).toEqual(before)
    expect(result.changes[0].originalLayer.transform).toMatchObject({ x: 0, scaleX: 1, scaleY: 1 })
  })

  it('rotates mixed-parent roots around exactly the shared visible pivot, preserving reflection', () => {
    const left = layer('left', { x: 100, y: 50, rotationDeg: 35, scaleX: -2, scaleY: 2 })
    const right = layer('right', { x: 400, y: 200, rotationDeg: -20, scaleX: 0.5, scaleY: 0.5 })
    const a = layer('a', { rotationDeg: 15, scaleX: -1, scaleY: 2 }, left.id)
    const b = layer('b', { rotationDeg: -10 }, right.id)
    const scene = { ...emptyScene(), layers: [left, right, a, b] }
    const result = prepareTransformTargets(scene, [a.id, b.id], 0)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const rotated = rotateTransformTargets(result.targets, result.pivot, 90)
    expect(rotated.ok).toBe(true)
    if (!rotated.ok) return
    expect(rotated.changes[0].transform.scaleX).toBeLessThan(0)
    const after = apply(scene, rotated.changes)
    for (const item of [a, b]) {
      const beforePoint = resolveLayerWorldMatrix(item, scene).applyToPoint({ x: 71, y: 23 })
      const afterPoint = resolveLayerWorldMatrix(after.layers.find(candidate => candidate.id === item.id)!, after).applyToPoint({ x: 71, y: 23 })
      expect(afterPoint.x).toBeCloseTo(result.pivot.x - (beforePoint.y - result.pivot.y))
      expect(afterPoint.y).toBeCloseTo(result.pivot.y + (beforePoint.x - result.pivot.x))
    }
  })

  it('keeps a single custom pivot fixed under rotation and uniform scale through a nonuniform parent', () => {
    const parent = layer('parent', { rotationDeg: 25, scaleX: -2, scaleY: 3 })
    const child = layer('child', { anchorX: -12, anchorY: 19, rotationDeg: 40 }, parent.id)
    const scene = { ...emptyScene(), layers: [parent, child] }
    const result = prepareTransformTargets(scene, [child.id], 0)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const scaled = scaleTransformTargets(result.targets, result.pivot, 1.5, 1.5)
    expect(scaled.ok).toBe(true)
    if (!scaled.ok) return
    const after = apply(scene, scaled.changes)
    const pivot = resolveLayerWorldMatrix(after.layers[1], after).applyToPoint({ x: -12, y: 19 })
    expect(pivot.x).toBeCloseTo(result.pivot.x)
    expect(pivot.y).toBeCloseTo(result.pivot.y)
    const beforePoint = resolveLayerWorldMatrix(child, scene).applyToPoint({ x: 0, y: 0 })
    const afterPoint = resolveLayerWorldMatrix(after.layers[1], after).applyToPoint({ x: 0, y: 0 })
    expect(afterPoint.x - pivot.x).toBeCloseTo((beforePoint.x - pivot.x) * 1.5)
    expect(afterPoint.y - pivot.y).toBeCloseTo((beforePoint.y - pivot.y) * 1.5)
    const unparented = { ...scene, layers: [{ ...child, parentId: undefined }] }
    const single = prepareTransformTargets(unparented, [child.id], 0)
    if (!single.ok) throw new Error(single.reason)
    const rotated = rotateTransformTargets(single.targets, single.pivot, 63)
    if (!rotated.ok) throw new Error(rotated.reason)
    const turned = apply(unparented, rotated.changes)
    const fixed = resolveLayerWorldMatrix(turned.layers[0], turned).applyToPoint({ x: -12, y: 19 })
    expect(fixed.x).toBeCloseTo(single.pivot.x)
    expect(fixed.y).toBeCloseTo(single.pivot.y)
  })

  it('rejects shear atomically instead of writing an approximate transform', () => {
    const parent = layer('parent', { scaleX: 2, scaleY: 1 })
    const child = layer('child', {}, parent.id), ordinary = layer('ordinary')
    const scene = { ...emptyScene(), layers: [ordinary, parent, child] }
    const prepared = prepareTransformTargets(scene, [ordinary.id, child.id], 0)
    if (!prepared.ok) throw new Error(prepared.reason)
    const result = rotateTransformTargets(prepared.targets, prepared.pivot, 45)
    expect(result).toMatchObject({ ok: false, layerId: child.id, reason: expect.stringMatching(/shear/) })
    expect(result).not.toHaveProperty('changes')
    const diagonal = layer('diagonal', { rotationDeg: 45 })
    const selection = prepareTransformTargets({ ...emptyScene(), layers: [diagonal] }, [diagonal.id], 0)
    if (!selection.ok) throw new Error(selection.reason)
    expect(scaleTransformTargets(selection.targets, selection.pivot, 2, 1).ok).toBe(false)
    expect(child.transform.rotationDeg).toBe(0)
  })

  it('preserves signed channels on no-op and rejects invalid or driven inputs', () => {
    const item = layer('item', { scaleX: -2, scaleY: 3, rotationDeg: 350 })
    const scene = { ...emptyScene(), layers: [item] }
    const prepared = prepareTransformTargets(scene, [item.id], 0)
    if (!prepared.ok) throw new Error(prepared.reason)
    for (const result of [rotateTransformTargets(prepared.targets, prepared.pivot, 0), scaleTransformTargets(prepared.targets, prepared.pivot, 1, 1)]) {
      if (!result.ok) throw new Error(result.reason)
      expect(result.changes[0].transform).toEqual(item.transform)
    }
    expect(scaleTransformTargets(prepared.targets, prepared.pivot, 0, 1).ok).toBe(false)
    expect(translateTransformTargets(prepared.targets, { x: Infinity, y: 0 }).ok).toBe(false)
    const frozen = { ...item, frozen: true }
    expect(prepareTransformTargets({ ...scene, layers: [frozen] }, [item.id], 0).ok).toBe(false)
    expect(prepareTransformTargets({ ...scene, layers: [{ ...item, followPath: { pathLayerId: 'guide' } }] }, [item.id], 0).ok).toBe(false)
    expect(prepareTransformTargets({ ...scene, layers: [{ ...item, paramBindings: { 'transform.x': 'slider' } }] }, [item.id], 0).ok).toBe(false)
    const parent = layer('parent', { scaleX: 0 }), child = layer('child', {}, parent.id)
    expect(prepareTransformTargets({ ...scene, layers: [parent, child] }, [child.id], 0)).toMatchObject({ ok: false, layerId: child.id })
    expect(prepareTransformTargets(scene, ['missing'], 0).ok).toBe(false)
    expect(prepareTransformTargets({ ...scene, layers: [{ ...item, parentId: item.id }] }, [item.id], 0).ok).toBe(false)
  })
})
