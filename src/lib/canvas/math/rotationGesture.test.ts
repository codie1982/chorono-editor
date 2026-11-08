import { describe, expect, it } from 'vitest'
import { emptyScene, newSplineLayerFromPrimitive } from '@/lib/defaults'
import type { Layer } from '@/lib/types'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { beginRotationGesture, rotationFromPointer } from './rotationGesture'

function shape(): Layer {
  return {
    id: 'shape', name: 'Card', type: 'shape', opacity: 1, size: { width: 100, height: 50 },
    transform: { x: 200, y: 100, anchorX: 50, anchorY: 25, rotationDeg: 10, scaleX: 1, scaleY: 1 },
  }
}

describe('rotation gesture around the displayed pivot', () => {
  it('uses the visible runtime position and rotation for an ordinary shape', () => {
    const scene = emptyScene()
    const layer = shape()
    scene.layers = [layer]
    const overrides = new Map([
      ['layers.shape.transform.x', 400], ['layers.shape.transform.y', 300],
      ['layers.shape.transform.rotationDeg', 70],
    ])
    const gesture = beginRotationGesture(layer, scene, 500, { x: 550, y: 325 }, overrides)!
    expect(gesture.worldPivot).toEqual({ x: 450, y: 325 })
    expect(rotationFromPointer(gesture, { x: 450, y: 425 }).rotationDeg).toBeCloseTo(160)
  })

  it.each([2, -2])('measures pointer angle through an anisotropic parent (scaleX=%s)', scaleX => {
    const scene = emptyScene()
    const parent = shape()
    parent.id = 'parent'
    parent.type = 'group'
    parent.transform = { x: 300, y: 200, anchorX: 0, anchorY: 0, rotationDeg: 35, scaleX, scaleY: 0.5 }
    const layer = shape()
    layer.parentId = parent.id
    layer.transform = { ...layer.transform, x: 20, y: 30, rotationDeg: 15 }
    scene.layers = [parent, layer]
    const parentMatrix = resolveLayerWorldMatrix(parent, scene, 0)
    const pivot = { x: 70, y: 55 }
    const start = parentMatrix.applyToPoint({ x: pivot.x + 100, y: pivot.y })
    const end = parentMatrix.applyToPoint({ x: pivot.x, y: pivot.y + 100 })
    const gesture = beginRotationGesture(layer, scene, 0, start)!
    const expectedPivot = parentMatrix.applyToPoint(pivot)
    expect(gesture.worldPivot.x).toBeCloseTo(expectedPivot.x)
    expect(gesture.worldPivot.y).toBeCloseTo(expectedPivot.y)
    expect(rotationFromPointer(gesture, end).rotationDeg).toBeCloseTo(105)
  })

  it('keeps a custom spline pivot fixed while the geometry turns around it', () => {
    const scene = emptyScene()
    const layer = newSplineLayerFromPrimitive('rectangle', { width: 80, height: 40 })!
    layer.transform = { ...layer.transform, x: 300, y: 200, anchorX: 12, anchorY: -7 }
    scene.layers = [layer]
    const gesture = beginRotationGesture(layer, scene, 0, { x: 412, y: 193 })!
    const result = rotationFromPointer(gesture, { x: 312, y: 293 })
    const rotated = { ...layer, transform: { ...layer.transform, rotationDeg: result.rotationDeg } }
    const pivot = resolveLayerWorldMatrix(rotated, scene, 0).applyToPoint({ x: 12, y: -7 })
    expect(pivot.x).toBeCloseTo(gesture.worldPivot.x)
    expect(pivot.y).toBeCloseTo(gesture.worldPivot.y)
    expect(result.rotationDeg).toBeCloseTo(90)
  })

  it('snaps the rotation delta and handles the angle wrap boundary', () => {
    const scene = emptyScene()
    const layer = shape()
    scene.layers = [layer]
    const pivot = { x: 250, y: 125 }
    const polar = (degrees: number) => ({
      x: pivot.x + 100 * Math.cos(degrees * Math.PI / 180),
      y: pivot.y + 100 * Math.sin(degrees * Math.PI / 180),
    })
    const gesture = beginRotationGesture(layer, scene, 0, polar(179))!
    expect(rotationFromPointer(gesture, polar(-179)).delta).toBeCloseTo(2)
    expect(rotationFromPointer(gesture, polar(-164), true).delta).toBeCloseTo(15)
  })

  it('refuses a gesture when the parent transform is collapsed', () => {
    const scene = emptyScene()
    const parent = shape()
    parent.id = 'parent'
    parent.type = 'group'
    parent.transform.scaleX = 0
    const layer = shape()
    layer.parentId = parent.id
    scene.layers = [parent, layer]
    expect(beginRotationGesture(layer, scene, 0, { x: 20, y: 30 })).toBeNull()
  })
})
