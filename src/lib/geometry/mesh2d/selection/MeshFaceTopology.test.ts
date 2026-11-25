import { describe, expect, it } from 'vitest'
import { StructuredGridMesh2DGenerator } from '../StructuredGridMesh2DGenerator'
import { Mesh2DTopologyHasher } from '../Mesh2DTopologyHasher'
import { Mesh2DTopologyValidator } from '../Mesh2DTopologyValidator'
import { Matrix2D } from '../../Matrix2D'
import { MeshFaceTopology } from './MeshFaceTopology'
import { MeshFaceGeometryConverter } from './MeshFaceGeometryConverter'
import { MeshComponentSelection } from './MeshComponentSelection'
import { MeshSubdivision } from '../modeling/subdivision/MeshSubdivision'
import { meshFaceInRegion } from './faceRegion'
import { emptyScene } from '../../../defaults'
import { newStructuredGridMesh2DLayer } from '../../../registry/definitions/mesh2d/Mesh2DDefinition'
import { makeBakeModifierStackCmd, makeTransformMeshGeometryCmd } from '../../../editor/modifiers/commands'

/** Compact real grid, preserving both renderer diagonal conventions. */
function grid(diagonal: 'topLeftToBottomRight' | 'topRightToBottomLeft' = 'topLeftToBottomRight') {
  return new StructuredGridMesh2DGenerator().generate({ width: 120, height: 80, columns: 3, rows: 2, diagonal })
}

describe('logical Mesh editing faces', () => {
  it.each(['topLeftToBottomRight', 'topRightToBottomLeft'] as const)('exposes six real cells and hides only their diagonals (%s)', diagonal => {
    const mesh = grid(diagonal), saved = structuredClone(mesh)
    expect(new Mesh2DTopologyValidator().validate(mesh.geometry).valid).toBe(true)
    const model = new MeshComponentSelection(mesh.geometry, Matrix2D.identity())
    expect(model.faces).toHaveLength(6)
    expect(model.faces.every(face => face.kind === 'quad' && face.vertices.length === 4)).toBe(true)
    expect(model.edges).toHaveLength(17)
    expect(model.points.length - model.edges.length + model.faces.length).toBe(1)
    const face = model.pick('face', { x: 20, y: 20 }, 1)!
    expect(model.vertices('face', [face])).toHaveLength(4)
    expect(model.pick('edge', { x: 20, y: 20 }, 1)).toBeNull()
    expect(model.pick('face', { x: -1, y: 20 }, 8)).toBeNull()
    expect(mesh).toEqual(saved)
  })

  it('recovers old grid cells only from a matching retained recipe and materializes only on explicit conversion', () => {
    const mesh = grid('topRightToBottomLeft'), topology = { ...mesh.geometry.topology, quadIndices: undefined }
    const legacy = { ...mesh.geometry, topology: { ...topology, topologyHash: new Mesh2DTopologyHasher().hash(topology) } }
    const saved = structuredClone(legacy)
    expect(new MeshFaceTopology(legacy).faces).toHaveLength(12)
    expect(new MeshFaceTopology(legacy, mesh.source).faces).toHaveLength(6)
    const materialized = new MeshFaceGeometryConverter().convert(legacy, mesh.source)
    expect(materialized.topology.quadIndices).toHaveLength(24)
    expect(new Mesh2DTopologyValidator().validate(materialized).valid).toBe(true)
    expect(materialized.positions).toBe(legacy.positions)
    expect(materialized.uvs).toBe(legacy.uvs)
    expect(legacy).toEqual(saved)
  })

  it('keeps stable face IDs across geometry edits and transforms shared face vertices once', () => {
    const mesh = grid(), before = new MeshComponentSelection(mesh.geometry, Matrix2D.identity())
    const moved = { ...mesh.geometry, positions: mesh.geometry.positions.map((v, i) => v + (i % 2 ? 3 : 5)) }
    const after = new MeshComponentSelection(moved, Matrix2D.translation(40, 30).rotate(27).scale(1.7, .6))
    expect(after.faces.map(f => f.id)).toEqual(before.faces.map(f => f.id))
    const ids = after.vertices('face', after.faces.slice(0, 2).map(f => f.id))
    expect(ids).toHaveLength(6)
    expect(new Set(ids).size).toBe(ids.length)
    const center = after.faces[0].vertices.reduce((sum, i) => ({ x: sum.x + after.points[i].x / 4, y: sum.y + after.points[i].y / 4 }), { x: 0, y: 0 })
    expect(after.pick('face', center, 0)).toBe(after.faces[0].id)
  })

  it('selects faces by tiny interior crossing regions, whole-face containment and brushes', () => {
    const model = new MeshComponentSelection(grid().geometry, Matrix2D.identity()), face = model.faces[0]
    expect(model.query('face', { kind: 'box', x: 10, y: 10, w: 2, h: 2 }, 'touching')).toEqual(new Set([face.id]))
    expect(model.query('face', { kind: 'box', x: 10, y: 10, w: 2, h: 2 }, 'inside').size).toBe(0)
    expect(model.query('face', { kind: 'box', x: -1, y: -1, w: 42, h: 42 }, 'inside')).toEqual(new Set([face.id]))
    expect(model.query('face', { kind: 'paint', cx: 20, cy: 20, r: 1 }, 'inside')).toEqual(new Set([face.id]))
  })

  it('rejects concave lasso notches even when all face corners are included', () => {
    const square = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }]
    const points = [{ x: -1, y: -1 }, { x: 10, y: -1 }, { x: 10, y: 20 }, { x: 30, y: 20 }, { x: 30, y: -1 }, { x: 41, y: -1 }, { x: 41, y: 41 }, { x: -1, y: 41 }]
    expect(meshFaceInRegion(square, { kind: 'lasso', points }, 'inside')).toBe(false)
  })

  it('preserves Delaunay triangles and Grid boundary transitions as independently selectable faces', () => {
    const source = grid().geometry
    const delaunay = new MeshSubdivision().subdivide(source, { algorithm: 'delaunay', levels: 1, cellSizePx: 30 }, 'd')
    expect(new MeshFaceTopology(delaunay).faces.every(f => f.kind === 'triangle')).toBe(true)
    const remeshed = new MeshSubdivision().subdivide(source, { algorithm: 'grid', levels: 1, cellSizePx: 30 }, 'q')
    const model = new MeshFaceTopology(remeshed)
    expect(model.faces.filter(f => f.kind === 'quad').length).toBeGreaterThan(0)
    expect(model.faces.reduce((sum, f) => sum + (f.kind === 'quad' ? 2 : 1), 0)).toBe(remeshed.topology.triangleIndices.length / 3)
  })

  it('keeps old triangle-only grids unchanged until explicit Bake, with exact native Undo', () => {
    const layer = newStructuredGridMesh2DLayer(), mesh = grid(), topology = { ...mesh.geometry.topology, quadIndices: undefined }
    layer.mesh2d = { ...mesh, geometry: { ...mesh.geometry, topology: { ...topology, topologyHash: new Mesh2DTopologyHasher().hash(topology) } } }
    const scene = { ...emptyScene(), layers: [layer] }, before = structuredClone(scene)
    const command = makeTransformMeshGeometryCmd(scene, layer.id, 'face-edit', { x: 2, y: 1, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 })
    const edited = command.execute(scene)
    expect(edited.layers[0].mesh2d!.geometry.topology.quadIndices).toBeUndefined()
    expect(scene).toEqual(before)
    const bake = makeBakeModifierStackCmd(edited, layer.id), baked = bake.execute(edited)
    expect(new MeshFaceTopology(baked.layers[0].mesh2d!.geometry).faces).toHaveLength(6)
    expect(baked.layers[0].mesh2d!.geometry.positions).toEqual(edited.layers[0].mesh2d!.geometry.positions)
    expect(new Mesh2DTopologyValidator().validate(baked.layers[0].mesh2d!.geometry).valid).toBe(true)
    expect(bake.undo(baked)).toEqual(edited)
  })
})
