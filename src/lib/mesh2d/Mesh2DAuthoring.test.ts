import { describe, expect, it } from 'vitest'
import { newStructuredGridMesh2DLayer } from '@/lib/registry/definitions/mesh2d/Mesh2DDefinition'
import {
  isMesh2DPinSelectionCurrent,
  selectMesh2DPinPreset,
  setMesh2DDeformation,
  setMesh2DPins,
  setMesh2DTexture,
  setMesh2DTextureTransform,
  resetMesh2DTextureTransform,
} from './Mesh2DAuthoring'

describe('Mesh2D authoring', () => {
  it('stores texture references without changing geometry', () => {
    const layer = newStructuredGridMesh2DLayer()
    const textured = setMesh2DTexture(layer, 'fabric', 'nearest')
    expect(textured.mesh2d?.appearance).toEqual({
      schemaVersion: 1,
      kind: 'texture',
      textureAssetId: 'fabric',
      sampling: 'nearest',
    })
    expect(textured.mesh2d?.geometry).toBe(layer.mesh2d?.geometry)
    expect(setMesh2DTexture(textured, null).mesh2d?.appearance?.kind).toBe('solid')
  })

  it('edits portable texture placement without mutating mesh geometry', () => {
    const layer = setMesh2DTexture(newStructuredGridMesh2DLayer(), 'fabric')
    const transformed = setMesh2DTextureTransform(layer, {
      fit: 'cover', offsetX: 12, scaleX: 1.5, rotationDeg: 15,
    })
    expect(transformed.mesh2d?.appearance?.textureTransform).toMatchObject({
      schemaVersion: 1, fit: 'cover', offsetX: 12, scaleX: 1.5, rotationDeg: 15,
    })
    expect(transformed.mesh2d?.geometry).toBe(layer.mesh2d?.geometry)
    const relinked = setMesh2DTexture(setMesh2DTexture(transformed, null), 'other')
    expect(relinked.mesh2d?.appearance?.textureTransform).toEqual(transformed.mesh2d?.appearance?.textureTransform)
    expect(resetMesh2DTextureTransform(relinked).mesh2d?.appearance?.textureTransform).toBeUndefined()
  })

  it('stores only a small deformation asset playback binding on the layer', () => {
    const layer = newStructuredGridMesh2DLayer()
    const bound = setMesh2DDeformation(layer, 'clip-a', { startTimeMs: 250, playbackRate: 0.5, loop: true })
    expect(bound.mesh2d?.deformation).toEqual({
      schemaVersion: 1, assetId: 'clip-a', startTimeMs: 250, playbackRate: 0.5, loop: true,
    })
    expect(setMesh2DDeformation(bound, null).mesh2d?.deformation).toBeUndefined()
    expect(() => setMesh2DDeformation(layer, 'clip-a', { playbackRate: 0 })).toThrow('positive')
  })

  it('selects deterministic structured-grid pin presets by stable vertex id', () => {
    const layer = newStructuredGridMesh2DLayer()
    const top = selectMesh2DPinPreset(layer, 'topEdge')
    const corners = selectMesh2DPinPreset(layer, 'corners')
    const boundary = selectMesh2DPinPreset(layer, 'boundary')
    expect(top.mesh2d?.pins?.vertexIds).toHaveLength(9)
    expect(corners.mesh2d?.pins?.vertexIds).toHaveLength(4)
    expect(boundary.mesh2d?.pins?.vertexIds).toHaveLength(28)
    expect(top.mesh2d?.pins?.topologyHash).toBe(layer.mesh2d?.geometry.topology.topologyHash)
  })

  it('rejects unknown ids and reports a preserved selection stale after topology changes', () => {
    const layer = selectMesh2DPinPreset(newStructuredGridMesh2DLayer(), 'corners')
    expect(() => setMesh2DPins(layer, ['missing'])).toThrow('Unknown Mesh2D vertex id')
    expect(isMesh2DPinSelectionCurrent(layer)).toBe(true)
    const changed = {
      ...layer,
      mesh2d: {
        ...layer.mesh2d!,
        geometry: {
          ...layer.mesh2d!.geometry,
          topology: { ...layer.mesh2d!.geometry.topology, topologyHash: 'changed' },
        },
      },
    }
    expect(isMesh2DPinSelectionCurrent(changed)).toBe(false)
  })
})
