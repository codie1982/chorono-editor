import { describe, expect, it } from 'vitest'
import { createCircleSpline, createDonutSpline, mergeSplineData, translateSplineData } from '..'
import { restructureSplinePaths } from './pathStructure'
import { hitTestSplineFill } from '../geometry/hitTest'
describe('Spline Compound / Separate Paths', () => {
  it('creates an exact Bézier compound hole without Boolean flattening', () => {
    const data = mergeSplineData(createCircleSpline({ radius: 60 }), createCircleSpline({ radius: 20 })), saved = structuredClone(data)
    const compound = restructureSplinePaths(data, [], 'compound')
    expect(Object.keys(compound.data.subShapes)).toHaveLength(1)
    expect(compound.data.points).toBe(data.points); expect(compound.data.handles).toBe(data.handles)
    expect(hitTestSplineFill(compound.data, 0, 0)).toBe(false)
    expect(hitTestSplineFill(compound.data, 40, 0)).toBe(true)
    expect(data).toEqual(saved)
  })
  it('separates islands into Objects and keeps holes attached to their outer contours', () => {
    const data = mergeSplineData(createDonutSpline({ outerRadius: 60, innerRadius: 20 }), translateSplineData(createDonutSpline({ outerRadius: 40, innerRadius: 15 }), 180, 0))
    const compound = restructureSplinePaths(data, [], 'compound').data
    const separated = restructureSplinePaths(compound, [], 'separate')
    expect(separated.ids).toHaveLength(2)
    expect(Object.values(separated.data.subShapes).every(object => object.contourIds.length === 2)).toBe(true)
    expect(separated.data.points).toEqual(data.points); expect(separated.data.handles).toEqual(data.handles)
  })
})
