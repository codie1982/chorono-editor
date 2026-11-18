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
