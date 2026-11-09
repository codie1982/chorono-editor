import { describe, expect, it } from 'vitest'
import {
  emptyScene, newArrowLayer, newBlobLayer, newCircleLayer, newLineLayer,
  newPolygonLayer, newRectLayer, newRingLayer, newSpiralLayer, newStarLayer, newWaveLayer,
} from '../../defaults'
import { ShapeToPathConverter } from '../../geometry/ShapeToPathConverter'
import { resolveLayerWorldMatrix } from '../../geometry/resolveLayerWorldMatrix'
import { canPlaceShape, placeShapeInGesture } from './index'

/** Resolve the same local-to-composition transform used by the renderer. */
function worldPoint(layer: ReturnType<typeof newRectLayer>, x: number, y: number) {
  return resolveLayerWorldMatrix(layer, { ...emptyScene(), layers: [layer] }).applyToPoint({ x, y })
}

describe('registry primitive pointer placement', () => {
  it('maps a drag box to source dimensions and centered pivot without mutating factory data', () => {
    const template = newRectLayer(), original = structuredClone(template)
    const placed = placeShapeInGesture(template, { x: 55, y: 80 }, { x: 185, y: 150 })
    expect(placed.size).toEqual({ width: 130, height: 70 })
    expect(placed.transform).toEqual({ x: 55, y: 80, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 65, anchorY: 35 })
    expect(worldPoint(placed, 0, 0)).toEqual({ x: 55, y: 80 })
    expect(worldPoint(placed, 130, 70)).toEqual({ x: 185, y: 150 })
    expect(placed.id).toBe(template.id); expect(placed.name).toBe(template.name)
    expect(placed.style).toBe(template.style); expect(template).toEqual(original)
  })

  it.each([
    [{ x: 100, y: 90 }, { x: -30, y: 20 }, { x: -30, y: 20 }],
    [{ x: -30, y: 90 }, { x: 100, y: 20 }, { x: -30, y: 20 }],
    [{ x: 100, y: 20 }, { x: -30, y: 90 }, { x: -30, y: 20 }],
  ])('normalizes reverse direction and permits off-artboard coordinates', (start, end, origin) => {
    const placed = placeShapeInGesture(newRectLayer(), start, end)
    expect(placed.size).toEqual({ width: 130, height: 70 })
    expect(worldPoint(placed, 0, 0)).toEqual(origin)
  })

  it('clicks retain default geometry at the pointer rather than the factory offset', () => {
    const template = newStarLayer()
    const placed = placeShapeInGesture(template, { x: -20, y: 14 }, { x: -19, y: 15 }, { useDefaultSize: true })
    expect(placed.size).toEqual(template.size)
    expect(placed.shapeParams).toEqual(template.shapeParams)
    expect(worldPoint(placed, 0, 0)).toEqual({ x: -20, y: 14 })
  })

  it('uses one pixel minimum dimensions for degenerate drag and Shift constrains a square', () => {
    const thin = placeShapeInGesture(newRectLayer(), { x: 10, y: 20 }, { x: 10, y: 60 })
    expect(thin.size).toEqual({ width: 1, height: 40 })
    const square = placeShapeInGesture(newRectLayer(), { x: 10, y: 20 }, { x: -90, y: 5 }, { constrain: true })
    expect(square.size).toEqual({ width: 100, height: 100 })
    expect(worldPoint(square, 0, 0)).toEqual({ x: -90, y: -80 })
  })

  it.each([newCircleLayer, newPolygonLayer, newStarLayer, newRingLayer, newSpiralLayer, newBlobLayer])(
    'radial factory %s avoids nonsquare nominal margins', factory => {
      const placed = placeShapeInGesture(factory(), { x: 200, y: 300 }, { x: 140, y: 200 })
      expect(placed.size).toEqual({ width: 100, height: 100 })
      expect(worldPoint(placed, 0, 0)).toEqual({ x: 100, y: 200 })
    })

  it('updates explicit radii and wave amplitude, preserving nondimensional parameters and style', () => {
    const star = newStarLayer(), ring = newRingLayer(), spiral = newSpiralLayer(), wave = newWaveLayer()
    const doubleStar = placeShapeInGesture(star, { x: 0, y: 0 }, { x: 240, y: 240 })
    expect(doubleStar.shapeParams).toEqual({ ...star.shapeParams, innerRadius: 54, outerRadius: 120 })
    const doubleRing = placeShapeInGesture(ring, { x: 0, y: 0 }, { x: 200, y: 200 })
    expect(doubleRing.shapeParams!.innerRadius).toBe(60)
    const doubleSpiral = placeShapeInGesture(spiral, { x: 0, y: 0 }, { x: 240, y: 240 })
    expect(doubleSpiral.shapeParams).toEqual({ ...spiral.shapeParams, startRadius: 8, endRadius: 112 })
    const tallWave = placeShapeInGesture(wave, { x: 0, y: 0 }, { x: 400, y: 160 })
    expect(tallWave.shapeParams).toEqual({ ...wave.shapeParams, amplitude: 40 })
    expect(doubleStar.style).toBe(star.style)
  })

  it.each([newLineLayer, newArrowLayer])('keeps signed segment endpoints and renderer world coordinates', factory => {
    const template = factory(), placed = placeShapeInGesture(template, { x: 120, y: 90 }, { x: -40, y: 10 })
    expect(placed.size).toEqual({ width: 160, height: 80 })
    expect(placed.shapeParams).toEqual({ ...template.shapeParams, x2: -160, y2: -80 })
    const path = ShapeToPathConverter.convert(placed.shapeKind!, placed.size!, placed.shapeParams)
    expect(path.commands[0]).toEqual({ type: 'M', x: 0, y: 0 })
    expect(path.commands[1]).toEqual({ type: 'L', x: -160, y: -80 })
    expect(worldPoint(placed, 0, 0)).toEqual({ x: 120, y: 90 })
    expect(worldPoint(placed, -160, -80)).toEqual({ x: -40, y: 10 })
    expect(placed.transform.anchorX).toBe(-80); expect(placed.transform.anchorY).toBe(-40)
  })

  it('places default horizontal lines on click and snaps Shift segments to 45 degree directions', () => {
    const template = newLineLayer()
    const clicked = placeShapeInGesture(template, { x: 12, y: 34 }, { x: 13, y: 35 }, { useDefaultSize: true })
    expect(clicked.shapeParams!.x2).toBe(160); expect(clicked.shapeParams!.y2).toBe(0)
    expect(worldPoint(clicked, 160, 0)).toEqual({ x: 172, y: 34 })
    const diagonal = placeShapeInGesture(template, { x: 0, y: 0 }, { x: -80, y: 60 }, { constrain: true })
    expect(diagonal.shapeParams!.x2).toBeCloseTo(-Math.SQRT1_2 * 100)
    expect(diagonal.shapeParams!.y2).toBeCloseTo(Math.SQRT1_2 * 100)
    const horizontal = placeShapeInGesture(template, { x: 0, y: 0 }, { x: 100, y: 2 }, { constrain: true })
    expect(horizontal.shapeParams!.y2).toBe(0)
  })

  it('rejects unsupported/invalid templates and coordinates without silently changing existing parent space', () => {
    const template = newRectLayer()
    expect(canPlaceShape(template)).toBe(true)
    expect(canPlaceShape({ ...template, type: 'text' })).toBe(false)
    expect(canPlaceShape({ ...template, size: { width: NaN, height: 10 } })).toBe(false)
    expect(() => placeShapeInGesture({ ...template, type: 'group' }, { x: 0, y: 0 }, { x: 10, y: 10 })).toThrow(/Unsupported/)
    expect(() => placeShapeInGesture({ ...template, parentId: 'parent' }, { x: 0, y: 0 }, { x: 10, y: 10 })).toThrow(/root/)
    expect(() => placeShapeInGesture(template, { x: Infinity, y: 0 }, { x: 10, y: 10 })).toThrow(/finite/)
    expect(() => placeShapeInGesture(template, { x: -Number.MAX_VALUE, y: 0 }, { x: Number.MAX_VALUE, y: 10 })).toThrow(/overflowed/)
  })
})
