import { describe, expect, it } from 'vitest'
import { activeStrokeDash, parseStrokeDash, strokeStyle, withStrokeStyle, strokePaintBox } from './strokeStyle'
import { strokeType, withStrokeType, stylePaintAssetIds } from './paintSource'
import { emptyScene, newSplineLayerFromData } from '../defaults'
import { createRectangleSpline } from '../spline'
import { parseSceneJson } from '../format/scene/SceneJsonConverter'

describe('source stroke contract', () => {
  it('keeps legacy dashes active, preserves inactive sequences, and creates round cap dots', () => {
    const stroke = { color: '#123456', width: 3, dashArray: [8, 4, 2] }, before = structuredClone(stroke)
    expect(activeStrokeDash(stroke)).toEqual([8, 4, 2])
    const solid = withStrokeStyle(stroke, 'solid')
    expect(activeStrokeDash(solid)).toEqual([]); expect(solid.dashArray).toEqual(stroke.dashArray)
    expect(withStrokeStyle(solid, 'dashed').dashArray).toEqual(stroke.dashArray)
    const dotted = withStrokeStyle(stroke, 'dotted')
    expect(strokeStyle(dotted)).toBe('dotted'); expect(dotted.lineCap).toBe('round')
    expect(parseStrokeDash('0, 6  2')).toEqual([0, 6, 2]); expect(stroke).toEqual(before)
  })
  it.each(['', '0, 0', '-1 3', 'NaN 3', 'Infinity 3', Array(257).fill(1).join(',')])('refuses invalid dash input %s', value => {
    expect(() => parseStrokeDash(value)).toThrow()
  })
  it('expands degenerate stroke paint bounds around the original line center', () => {
    expect(strokePaintBox({ x: 20, y: 30, width: 0, height: 100 }, 6)).toEqual({ x: 17, y: 30, width: 6, height: 100 })
  })
  it('retains pattern data across None, round-trips it and indexes active paint demand', () => {
    const pattern = withStrokeType({ color: '#000000', width: 3 }, 'pattern')
    pattern.image!.assetId = 'texture'
    const none = withStrokeType(pattern, 'none'), restored = withStrokeType(none, 'pattern')
    expect(strokeType(none)).toBe('none'); expect(restored.image).toEqual(pattern.image)
    expect(stylePaintAssetIds({ stroke: pattern })).toEqual(['texture'])
    expect(stylePaintAssetIds({ stroke: none })).toEqual([])
    const layer = newSplineLayerFromData(createRectangleSpline({ width: 100, height: 80 }))
    layer.style = { fill: { type: 'none' }, stroke: { ...pattern, alignment: 'outside', dashEnabled: true, dashArray: [4, 2], lineCap: 'square', lineJoin: 'bevel' } }
    expect(parseSceneJson(JSON.stringify({ ...emptyScene(), layers: [layer] })).layers[0].style).toEqual(layer.style)
  })
})
