import { describe, expect, it } from 'vitest'
import { containsMesh2DPoint } from './Mesh2DGeometryQueries'
import { ShapeBoundaryMesh2DGenerator } from './ShapeBoundaryMesh2DGenerator'

describe('ShapeBoundaryMesh2DGenerator', () => {
  const generator = new ShapeBoundaryMesh2DGenerator()

  it('uses the parametric shape path as deterministic fixed topology', () => {
    const input = { kind: 'rect' as const, size: { width: 120, height: 80 }, cornerRadius: 12 }
    const first = generator.generate('rect-1', input)
    const second = generator.generate('rect-1', input)

    expect(first.source).toMatchObject({
      kind: 'shapeBoundary', sourceLayerId: 'rect-1', flattenTolerance: 0.25,
      triangulation: { algorithm: 'earcut', algorithmVersion: '3.2.4' },
    })
    expect(first.geometry.topology.topologyHash).toBe(second.geometry.topology.topologyHash)
    expect(first.geometry.topology.vertexIds.every(id => id.startsWith('shape:'))).toBe(true)
    expect(generator.isCurrent(first, input)).toBe(true)
  })

  it('preserves a full ring as an outer boundary with a real hole', () => {
    const result = generator.generate('ring-1', {
      kind: 'ring',
      size: { width: 120, height: 120 },
      params: { kind: 'ring', innerRadius: 25, startAngle: 0, endAngle: 360 },
    })

    expect(containsMesh2DPoint(result.geometry, 60, 60)).toBe(false)
    expect(containsMesh2DPoint(result.geometry, 100, 60)).toBe(true)
    expect(containsMesh2DPoint(result.geometry, 125, 60)).toBe(false)
  })

  it('treats a zero-radius full-ring hole as a filled disk', () => {
    const result = generator.generate('disk-1', {
      kind: 'ring',
      size: { width: 100, height: 100 },
      params: { kind: 'ring', innerRadius: 0, startAngle: 0, endAngle: 360 },
    })
    expect(containsMesh2DPoint(result.geometry, 50, 50)).toBe(true)
  })

  it('marks geometry edits stale and rejects open shape kinds', () => {
    const input = {
      kind: 'star' as const,
      size: { width: 100, height: 100 },
      params: { kind: 'star' as const, sides: 5, outerRadius: 50, innerRadius: 20 },
    }
    const mesh = generator.generate('star-1', input)
    expect(generator.isCurrent(mesh, { ...input, params: { ...input.params, innerRadius: 30 } })).toBe(false)
    expect(() => generator.generate('line-1', {
      kind: 'line', size: { width: 100, height: 20 }, params: { kind: 'line', x2: 100, y2: 0 },
    })).toThrow(/open or unsupported/)
  })
})
