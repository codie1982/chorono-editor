import { describe, expect, it } from 'vitest'
import { StructuredGridMesh2DGenerator } from './StructuredGridMesh2DGenerator'
import { computeMesh2DLocalBounds, containsMesh2DPoint } from './Mesh2DGeometryQueries'

describe('Mesh2D geometry queries', () => {
  it('computes finite local bounds and rejects malformed position payloads', () => {
    const geometry = new StructuredGridMesh2DGenerator().generate({ width: 80, height: 40, columns: 2, rows: 1 }).geometry
    expect(computeMesh2DLocalBounds(geometry)).toEqual({ x: 0, y: 0, width: 80, height: 40 })
    expect(computeMesh2DLocalBounds({ ...geometry, positions: [0, 1, 2] })).toBeNull()
    expect(computeMesh2DLocalBounds({ ...geometry, positions: [0, Number.NaN] })).toBeNull()
  })

  it('hits actual triangles including edges and preserves holes', () => {
    const geometry = {
      positions: [0, 0, 40, 0, 0, 40, 100, 100, 140, 100, 100, 140],
      uvs: new Array(12).fill(0),
      topology: {
        schemaVersion: 1 as const,
        vertexIds: ['a', 'b', 'c', 'd', 'e', 'f'],
        triangleIndices: [0, 1, 2, 3, 4, 5],
        topologyHash: 'fixture',
      },
    }
    expect(containsMesh2DPoint(geometry, 10, 10)).toBe(true)
    expect(containsMesh2DPoint(geometry, 20, 20)).toBe(true)
    expect(containsMesh2DPoint(geometry, 70, 70)).toBe(false)
    expect(containsMesh2DPoint(geometry, 110, 110)).toBe(true)
  })

  it('skips invalid triangles without throwing', () => {
    const geometry = new StructuredGridMesh2DGenerator().generate({ width: 40, height: 40, columns: 1, rows: 1 }).geometry
    const malformed = { ...geometry, topology: { ...geometry.topology, triangleIndices: [-1, 1, 2, 0, 1, 99] } }
    expect(() => containsMesh2DPoint(malformed, 10, 10)).not.toThrow()
    expect(containsMesh2DPoint(malformed, 10, 10)).toBe(false)
    const degenerate = { ...geometry, positions: [0, 0, 20, 20, 40, 40, 40, 0, 0, 40, 40, 40],
      topology: { ...geometry.topology, triangleIndices: [0, 1, 2] } }
    expect(containsMesh2DPoint(degenerate, 500, 500)).toBe(false)
  })
})
