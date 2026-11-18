import { describe, expect, it } from 'vitest'
import { newStructuredGridMesh2DLayer } from '@/lib/registry/definitions/mesh2d/Mesh2DDefinition'
import {
  isMesh2DPinSelectionCurrent,
  selectMesh2DPinPreset,
  setMesh2DPins,
  setMesh2DTexture,
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
