import { describe, expect, it } from 'vitest'
import { newSplineLayerFromData, newStarLayer } from '@/lib/defaults'
import { mergeSplineData } from '@/lib/spline/factory/mergeSplineData'
import { createCircleSpline } from '@/lib/spline/primitives/createCircleSpline'
import { Mesh2DTopologyValidator } from '@/lib/geometry/mesh2d'
import { FractureRegionClipper } from '../FractureRegionClipper'
import { FractureSourceRegionCompiler } from '../FractureSourceRegionCompiler'

describe('FractureRegionClipper', () => {
  const sourceCompiler = new FractureSourceRegionCompiler()
  const clipper = new FractureRegionClipper()
  const validator = new Mesh2DTopologyValidator()

  it('preserves a complete concave source as one component with convex parts', () => {
    const source = sourceCompiler.compile({ ...newStarLayer(), id: 'star-source' })
    const padding = 10
    const components = clipper.clip(source.geometry, [
      { x: source.boundsPx.minX - padding, y: source.boundsPx.minY - padding },
      { x: source.boundsPx.maxX + padding, y: source.boundsPx.minY - padding },
      { x: source.boundsPx.maxX + padding, y: source.boundsPx.maxY + padding },
      { x: source.boundsPx.minX - padding, y: source.boundsPx.maxY + padding },
    ], 'star-cell')

    expect(components).toHaveLength(1)
    expect(components[0].areaPx2).toBeCloseTo(source.areaPx2, 6)
    expect(components[0].colliderParts.length).toBeGreaterThan(1)
    expect(components[0].boundaryRings.map(ring => ring.role)).toEqual(['outer'])
    expect(validator.validate(components[0].geometry).valid).toBe(true)
  })

  it('retains the outer and hole rings of a complete donut intersection', () => {
    const source = donutSource()
    const components = clipper.clip(source.geometry, [
      { x: -90, y: -90 }, { x: 90, y: -90 }, { x: 90, y: 90 }, { x: -90, y: 90 },
    ], 'donut-cell')

    expect(components).toHaveLength(1)
    expect(components[0].areaPx2).toBeCloseTo(source.areaPx2, 5)
    expect(components[0].boundaryRings.map(ring => ring.role).sort()).toEqual(['hole', 'outer'])
  })

  it('splits one Voronoi-like strip into separate edge-connected bodies', () => {
    const source = donutSource()
    const components = clipper.clip(source.geometry, [
      { x: -10, y: -90 }, { x: 10, y: -90 }, { x: 10, y: 90 }, { x: -10, y: 90 },
    ], 'strip-cell')

    expect(components).toHaveLength(2)
    expect(components.every(component => component.boundaryRings.length === 1)).toBe(true)
    expect(components.every(component => component.boundaryRings[0].role === 'outer')).toBe(true)
    expect(components[0].centroidPx.y).not.toBeCloseTo(components[1].centroidPx.y, 3)
  })

  function donutSource() {
    const spline = mergeSplineData(createCircleSpline({ radius: 80 }), createCircleSpline({ radius: 30 }))
    spline.fillRule = 'evenodd'
    return sourceCompiler.compile(newSplineLayerFromData(spline, { name: 'Donut', x: 0, y: 0 }))
  }
})
