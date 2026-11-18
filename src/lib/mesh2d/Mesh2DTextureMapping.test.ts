import { describe, expect, it } from 'vitest'
import { newStructuredGridMesh2DLayer } from '@/lib/registry/definitions/mesh2d/Mesh2DDefinition'
import {
  DEFAULT_MESH2D_TEXTURE_TRANSFORM,
  resolveMesh2DTexturePlacement,
  resolveMesh2DTextureTransform,
} from './Mesh2DTextureMapping'

describe('Mesh2D texture mapping', () => {
  const geometry = newStructuredGridMesh2DLayer().mesh2d!.geometry

  it('preserves the historical full-bounds UV mapping when placement is absent', () => {
    const placement = resolveMesh2DTexturePlacement(geometry, 480, 160)
    expect(placement?.sourceToLocal.applyToPoint({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 })
    expect(placement?.sourceToLocal.applyToPoint({ x: 480, y: 160 })).toEqual({ x: 240, y: 160 })
  })

  it('supports centered aspect fits and axis-specific fits without changing topology', () => {
    const contain = resolveMesh2DTexturePlacement(geometry, 100, 100, {
      ...DEFAULT_MESH2D_TEXTURE_TRANSFORM, fit: 'contain',
    })!
    expect(contain.corners[0]).toEqual({ x: 40, y: 0 })
    expect(contain.corners[2]).toEqual({ x: 200, y: 160 })
    const fitX = resolveMesh2DTexturePlacement(geometry, 100, 100, {
      ...DEFAULT_MESH2D_TEXTURE_TRANSFORM, fit: 'fitX',
    })!
    expect(fitX.corners[0]).toEqual({ x: 0, y: -40 })
    expect(fitX.corners[2]).toEqual({ x: 240, y: 200 })
  })

  it('applies offset, pivoted scale and explicit reflection in local space', () => {
    const placement = resolveMesh2DTexturePlacement(geometry, 240, 160, {
      ...DEFAULT_MESH2D_TEXTURE_TRANSFORM,
      offsetX: 10,
      offsetY: -5,
      scaleX: 2,
      flipY: true,
    })!
    expect(placement.pivot.x).toBeCloseTo(130)
    expect(placement.pivot.y).toBeCloseTo(75)
    expect(placement.corners[0].x).toBeCloseTo(-110)
    expect(placement.corners[0].y).toBeCloseTo(155)
  })

  it('rejects non-finite, non-positive and out-of-range portable values', () => {
    expect(() => resolveMesh2DTextureTransform({ ...DEFAULT_MESH2D_TEXTURE_TRANSFORM, scaleX: 0 })).toThrow('positive')
    expect(() => resolveMesh2DTextureTransform({ ...DEFAULT_MESH2D_TEXTURE_TRANSFORM, pivotU: 2 })).toThrow('between 0 and 1')
    expect(() => resolveMesh2DTextureTransform({ ...DEFAULT_MESH2D_TEXTURE_TRANSFORM, offsetX: Number.NaN })).toThrow('finite')
  })
})
