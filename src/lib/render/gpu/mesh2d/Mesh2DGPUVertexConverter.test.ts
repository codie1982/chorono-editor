import { describe, expect, it } from 'vitest'
import { resolveMesh2DTexturePlacement } from '@/lib/mesh2d/Mesh2DTextureMapping'
import type { Mesh2DGeometry } from '@/lib/types/mesh2d'
import { buildMesh2DAffineTransformMatrix } from './Mesh2DGPUBackend'
import { Mesh2DGPUVertexConverter } from './Mesh2DGPUVertexConverter'

const geometry: Mesh2DGeometry = {
  positions: [0, 0, 100, 0, 0, 100],
  uvs: [0, 0, 1, 0, 0, 1],
  topology: { schemaVersion: 1, vertexIds: ['a', 'b', 'c'], triangleIndices: [0, 1, 2], topologyHash: 'triangle' },
}

describe('Mesh2D GPU preparation', () => {
  it('packs deformed destinations with Canvas-compatible source UVs', () => {
    const placement = resolveMesh2DTexturePlacement(geometry, 100, 100)!
    const result = Mesh2DGPUVertexConverter.convert(
      geometry, Float32Array.from([20, 30, 220, 30, 20, 230]), placement, 100, 100,
    )!
    expect(result.triangleCount).toBe(1)
    expect(Array.from(result.vertices)).toEqual([
      20, 30, 0, 0,
      220, 30, 1, 0,
      20, 230, 0, 1,
    ])
  })

  it('rejects a degenerate UV triangle so the whole mesh can fall back', () => {
    const invalid = { ...geometry, uvs: [0, 0, 0, 0, 0, 0] }
    const placement = resolveMesh2DTexturePlacement(invalid, 100, 100)!
    expect(Mesh2DGPUVertexConverter.convert(invalid, invalid.positions, placement, 100, 100)).toBeNull()
  })

  it('keeps source-rectangle UVs when destination geometry covers only one fragment', () => {
    const fragment: Mesh2DGeometry = {
      positions: [100, 50, 200, 50, 150, 150],
      uvs: [100 / 320, 50 / 180, 200 / 320, 50 / 180, 150 / 320, 150 / 180],
      topology: { schemaVersion: 1, vertexIds: ['a', 'b', 'c'], triangleIndices: [0, 1, 2], topologyHash: 'fragment' },
      textureReferenceBounds: { x: 0, y: 0, width: 320, height: 180 },
    }
    const placement = resolveMesh2DTexturePlacement(fragment, 640, 360)!
    const result = Mesh2DGPUVertexConverter.convert(fragment, fragment.positions, placement, 640, 360)!

    const values = Array.from(result.vertices)
    expect([values[0], values[1], values[4], values[5], values[8], values[9]])
      .toEqual([100, 50, 200, 50, 150, 150])
    expect(values[2]).toBeCloseTo(100 / 320, 7)
    expect(values[3]).toBeCloseTo(50 / 180, 7)
    expect(values[6]).toBeCloseTo(200 / 320, 7)
    expect(values[7]).toBeCloseTo(50 / 180, 7)
    expect(values[10]).toBeCloseTo(150 / 320, 7)
    expect(values[11]).toBeCloseTo(150 / 180, 7)
  })

  it('projects the complete Canvas affine transform into backing clip space', () => {
    expect(Array.from(buildMesh2DAffineTransformMatrix(200, 100, {
      a: 2, b: 0, c: 0, d: 3, e: 50, f: 25,
    }))).toEqual([
      0.019999999552965164, -0, 0,
      0, -0.05999999865889549, 0,
      -0.5, 0.5, 1,
    ])
  })
})
