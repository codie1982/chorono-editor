import { describe, expect, it } from 'vitest'
import { newSplineLayerFromData } from '@/lib/defaults'
import { mergeSplineData } from '@/lib/spline/factory/mergeSplineData'
import { createCircleSpline } from '@/lib/spline/primitives/createCircleSpline'
import { StructuredGridMesh2DGenerator } from './StructuredGridMesh2DGenerator'
import { SplineBoundaryMesh2DGenerator } from './SplineBoundaryMesh2DGenerator'
import { Mesh2DBoundaryRingExtractor } from './Mesh2DBoundaryRingExtractor'

describe('Mesh2DBoundaryRingExtractor', () => {
  const extractor = new Mesh2DBoundaryRingExtractor()

  it('extracts one normalized outer ring from a structured grid', () => {
    const geometry = new StructuredGridMesh2DGenerator().generate({
      width: 120,
      height: 80,
      columns: 3,
      rows: 2,
    }).geometry
    const rings = extractor.extract(geometry)

    expect(rings).toHaveLength(1)
    expect(rings[0]).toMatchObject({ role: 'outer', depth: 0, parentIndex: null })
    expect(rings[0].vertexIndices).toHaveLength(10)
    expect(rings[0].signedDoubleArea).toBeGreaterThan(0)
  })

  it('classifies an even-odd inner contour as a normalized hole', () => {
    const outer = createCircleSpline({ radius: 80 })
    const inner = createCircleSpline({ radius: 30 })
    const spline = mergeSplineData(outer, inner)
    spline.fillRule = 'evenodd'
    const layer = newSplineLayerFromData(spline)
    const geometry = new SplineBoundaryMesh2DGenerator().generate(layer.id, layer.spline!).geometry
    const rings = extractor.extract(geometry)

    expect(rings).toHaveLength(2)
    const outerRing = rings.find(ring => ring.role === 'outer')!
    const hole = rings.find(ring => ring.role === 'hole')!
    expect(outerRing).toMatchObject({ depth: 0, parentIndex: null })
    expect(outerRing.signedDoubleArea).toBeGreaterThan(0)
    expect(hole.depth).toBe(1)
    expect(hole.parentIndex).not.toBeNull()
    expect(hole.signedDoubleArea).toBeLessThan(0)
  })
})
