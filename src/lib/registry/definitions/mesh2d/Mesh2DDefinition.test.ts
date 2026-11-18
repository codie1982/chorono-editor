import { describe, expect, it } from 'vitest'
import {
  isSplineBoundaryMesh2DCurrent,
  mesh2DDefinition,
  newSplineBoundaryMesh2DLayer,
  newStructuredGridMesh2DLayer,
  regenerateSplineBoundaryMesh2DLayer,
  regenerateStructuredGridMesh2DLayer,
} from './Mesh2DDefinition'
import { newSplineLayerFromData } from '@/lib/defaults'
import { createRectangleSpline } from '@/lib/spline/primitives/createRectangleSpline'

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
    expect(updated.mesh2d?.source.kind).toBe('structuredGrid')
    if (updated.mesh2d?.source.kind !== 'structuredGrid') throw new Error('Expected structured-grid source')
    expect(updated.mesh2d.source.columns).toBe(4)
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
    if (custom.mesh2d!.source.kind !== 'structuredGrid') throw new Error('Expected structured-grid source')
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

describe('spline-boundary Mesh2D layer definition', () => {
  it('creates a separate linked layer and preserves the source', () => {
    const source = newSplineLayerFromData(createRectangleSpline({ width: 120, height: 80 }), {
      name: 'Badge', x: 320, y: 180,
    })
    const before = JSON.stringify(source)
    const mesh = newSplineBoundaryMesh2DLayer(source)

    expect(mesh.type).toBe('mesh2d')
    expect(mesh.name).toBe('Badge Mesh2D')
    expect(mesh.transform).toEqual(source.transform)
    expect(mesh.mesh2d?.source.kind).toBe('splineBoundary')
    if (mesh.mesh2d?.source.kind !== 'splineBoundary') throw new Error('Expected spline-boundary source')
    expect(mesh.mesh2d.source.sourceLayerId).toBe(source.id)
    expect(mesh.mesh2d.geometry.topology.triangleIndices).toHaveLength(6)
    expect(JSON.stringify(source)).toBe(before)
    expect(isSplineBoundaryMesh2DCurrent(mesh, source)).toBe(true)
  })

  it('detects source edits and regenerates geometry in one immutable snapshot', () => {
    const source = newSplineLayerFromData(createRectangleSpline({ width: 120, height: 80 }))
    const mesh = newSplineBoundaryMesh2DLayer(source)
    const pointId = Object.keys(source.spline!.points)[0]
    const edited = {
      ...source,
      spline: {
        ...source.spline!,
        points: {
          ...source.spline!.points,
          [pointId]: { ...source.spline!.points[pointId], x: source.spline!.points[pointId].x - 20 },
        },
      },
    }

    expect(isSplineBoundaryMesh2DCurrent(mesh, edited)).toBe(false)
    const regenerated = regenerateSplineBoundaryMesh2DLayer(mesh, edited)
    expect(regenerated).not.toBe(mesh)
    expect(isSplineBoundaryMesh2DCurrent(regenerated, edited)).toBe(true)
    expect(regenerated.mesh2d?.source.kind).toBe('splineBoundary')
    expect(mesh.mesh2d?.source.kind).toBe('splineBoundary')
    if (regenerated.mesh2d?.source.kind !== 'splineBoundary' || mesh.mesh2d?.source.kind !== 'splineBoundary') {
      throw new Error('Expected spline-boundary sources')
    }
    expect(regenerated.mesh2d.source.sourceFingerprint).not.toBe(mesh.mesh2d.source.sourceFingerprint)
  })
})
