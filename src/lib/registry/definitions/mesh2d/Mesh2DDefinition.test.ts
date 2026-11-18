import { describe, expect, it } from 'vitest'
import {
  mesh2DDefinition,
  newStructuredGridMesh2DLayer,
  regenerateStructuredGridMesh2DLayer,
} from './Mesh2DDefinition'

describe('structured-grid Mesh2D layer definition', () => {
  it('creates a complete validated default layer', () => {
    const layer = newStructuredGridMesh2DLayer()
    expect(layer.type).toBe('mesh2d')
    expect(layer.size).toEqual({ width: 240, height: 160 })
    expect(layer.transform.anchorX).toBe(120)
    expect(layer.transform.anchorY).toBe(80)
    expect(layer.mesh2d?.geometry.positions).toHaveLength(63 * 2)
    expect(layer.mesh2d?.geometry.topology.triangleIndices).toHaveLength(8 * 6 * 2 * 3)
    expect(layer.mesh2d?.geometry.topology.topologyHash).toMatch(/^[0-9a-f]{16}$/)
  })

  it('regenerates derived geometry as one immutable layer snapshot', () => {
    const original = newStructuredGridMesh2DLayer()
    const before = JSON.stringify(original)
    const updated = mesh2DDefinition.applyPropertyChange!(original, 'mesh2d.source.columns', 4)
    expect(updated).not.toBe(original)
    expect(updated.mesh2d?.source.columns).toBe(4)
    expect(updated.mesh2d?.geometry.positions).toHaveLength((4 + 1) * (6 + 1) * 2)
    expect(updated.mesh2d?.geometry.topology.topologyHash).not.toBe(original.mesh2d?.geometry.topology.topologyHash)
    expect(JSON.stringify(original)).toBe(before)
  })

  it('recentres a centred pivot on resize but preserves a custom pivot', () => {
    const original = newStructuredGridMesh2DLayer()
    const centred = mesh2DDefinition.applyPropertyChange!(original, 'mesh2d.source.width', 400)
    expect(centred.size?.width).toBe(400)
    expect(centred.transform.anchorX).toBe(200)
    expect(centred.mesh2d?.geometry.topology.topologyHash).toBe(original.mesh2d?.geometry.topology.topologyHash)

    const custom = { ...original, transform: { ...original.transform, anchorX: 10 } }
    const resized = regenerateStructuredGridMesh2DLayer(custom, { ...custom.mesh2d!.source, width: 400 })
    expect(resized.transform.anchorX).toBe(10)
  })

  it('rejects fractional cell counts before changing the source layer', () => {
    const original = newStructuredGridMesh2DLayer()
    const before = JSON.stringify(original)
    expect(() => mesh2DDefinition.applyPropertyChange!(original, 'mesh2d.source.rows', 2.5))
      .toThrow(/positive safe integers/)
    expect(JSON.stringify(original)).toBe(before)
  })
})
