import { describe, expect, it } from 'vitest'
import { emptyScene, newSplineLayerFromPrimitive } from '@/lib/defaults'
import { resolveLayerWorldMatrix } from './resolveLayerWorldMatrix'
import { LayerIndex } from '@/lib/scene/LayerIndex'

describe.each([false,true])('resolveLayerWorldMatrix (indexed=%s)', indexed => {
  it('uses parent rotation and anchor-centered layer rotation/scale', () => {
    const scene = emptyScene()
    const parent = newSplineLayerFromPrimitive('circle', { radius: 10 })!
    parent.type = 'group'
    parent.transform = { x: 200, y: 50, anchorX: 0, anchorY: 0, rotationDeg: 90, scaleX: 1, scaleY: 1 }
    const child = newSplineLayerFromPrimitive('circle', { radius: 10 })!
    child.parentId = parent.id
    child.transform = { x: 100, y: 70, anchorX: 10, anchorY: 20, rotationDeg: 90, scaleX: 2, scaleY: 3 }
    scene.layers = [parent, child]
    const matrix = resolveLayerWorldMatrix(child, scene, 0, undefined, indexed ? new LayerIndex(scene.layers) : undefined)
    const point = matrix.applyToPoint({ x: 12, y: 25 })
    expect(point.x).toBeCloseTo(106)
    expect(point.y).toBeCloseTo(145)
    const local = matrix.invert().applyToPoint(point)
    expect(local.x).toBeCloseTo(12)
    expect(local.y).toBeCloseTo(25)
  })

  it('uses animated transforms for the child and its parent', () => {
    const scene = emptyScene()
    const parent = newSplineLayerFromPrimitive('circle', { radius: 10 })!
    parent.type = 'group'
    parent.transform = { x: 0, y: 0, anchorX: 0, anchorY: 0, rotationDeg: 0, scaleX: 1, scaleY: 1 }
    const child = newSplineLayerFromPrimitive('circle', { radius: 10 })!
    child.parentId = parent.id
    child.transform = { ...parent.transform }
    scene.layers = [parent, child]
    const overrides = new Map([
      [`layers.${parent.id}.transform.x`, 300],
      [`layers.${parent.id}.transform.rotationDeg`, 90],
      [`layers.${child.id}.transform.y`, 50],
      [`layers.${child.id}.transform.scaleX`, -2],
    ])
    const point = resolveLayerWorldMatrix(child, scene, 1000, overrides,
      indexed ? new LayerIndex(scene.layers) : undefined).applyToPoint({ x: 10, y: 0 })
    expect(point.x).toBeCloseTo(250)
    expect(point.y).toBeCloseTo(-20)
  })
})
