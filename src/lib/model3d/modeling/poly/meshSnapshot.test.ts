import { describe, expect, it } from 'vitest'
import { meshBorderEdges, meshElements, primitiveMeshSnapshot } from './meshSnapshot'
import { expandPolySelection, updatePolySelection } from './editSelection'
import { topologyFingerprint } from '../stack/contracts'
import { triangulateConvexMesh } from './meshTriangulation'
import { primitiveRenderGeometry } from './PrimitiveRenderGeometry'
import type { MeshSnapshot } from './meshSnapshot'

describe('authored primitive logical topology', () => {
  it('keeps Box at 8 vertices, 12 real edges and 6 quad polygons', () => {
    const mesh = primitiveMeshSnapshot({ kind: 'box', width: 1, height: 2, depth: 3 })
    expect([mesh.vertices.length, mesh.edges.length, mesh.faces.length, mesh.halfEdges.length]).toEqual([8, 12, 6, 24])
    expect(mesh.faces.every(face => face.corners.length === 4)).toBe(true)
    expect(mesh.faces.every(face => {
      const [a, b, c] = face.corners.map(corner => corner.uv)
      return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) > 0
    })).toBe(true)
    expect(mesh.edges.every(edge => edge.halfEdgeIds.length === 2)).toBe(true)
    expect(meshBorderEdges(mesh)).toHaveLength(0)
    expect(meshElements(mesh)).toHaveLength(1)
    for (const half of mesh.halfEdges) {
      const twin = mesh.halfEdges.find(value => value.id === half.twinId)
      expect(twin).toMatchObject({ from: half.to, to: half.from, twinId: half.id })
      expect(mesh.halfEdges.find(value => value.id === half.nextId)?.prevId).toBe(half.id)
      expect(mesh.halfEdges.find(value => value.id === half.prevId)?.nextId).toBe(half.id)
    }
    expect(mesh.vertices.every(vertex => mesh.halfEdges.some(half => half.id === vertex.outgoingHalfEdgeId && half.from === vertex.id))).toBe(true)
    expect(mesh.faces.every(face => face.corners[0].halfEdgeId === face.outerHalfEdgeId)).toBe(true)
    expect(topologyFingerprint(primitiveMeshSnapshot({ kind: 'box', width: 4, height: 5, depth: 6 }))).toBe(topologyFingerprint(mesh))
  })

  it('provides an open Plane border loop and one element', () => {
    const mesh = primitiveMeshSnapshot({ kind: 'plane', width: 1, depth: 2 })
    expect([mesh.vertices.length, mesh.edges.length, mesh.faces.length]).toEqual([4, 4, 1])
    expect(meshBorderEdges(mesh)).toHaveLength(4)
    expect(expandPolySelection(mesh, 'border', mesh.edges[0].id)).toHaveLength(4)
    expect(expandPolySelection(mesh, 'element', mesh.faces[0].id)).toEqual([mesh.faces[0].id])
  })

  it('derives render vertices and hidden diagonals from one logical Box', () => {
    const mesh = primitiveMeshSnapshot({ kind: 'box', width: 1, height: 1, depth: 1 })
    const triangles = triangulateConvexMesh(mesh), render = primitiveRenderGeometry(mesh)
    expect(triangles).toHaveLength(12)
    expect(render.getAttribute('position').count).toBe(36)
    expect(render.getAttribute('position').count).toBeGreaterThan(mesh.vertices.length)
    expect(render.userData.choronoFaceIds).toEqual(triangles.map(triangle => triangle.faceId))
    expect(mesh.edges.some(edge => edge.vertices.includes('v4') && edge.vertices.includes('v6'))).toBe(false)
    render.dispose()
  })

  it('keeps Sphere UV seam and Cylinder hard cap in corner data without borders', () => {
    const sphere = primitiveMeshSnapshot({ kind: 'sphere', radius: 1 })
    const cylinder = primitiveMeshSnapshot({ kind: 'cylinder', radius: 1, height: 2 })
    expect(meshBorderEdges(sphere)).toHaveLength(0)
    expect(meshBorderEdges(cylinder)).toHaveLength(0)
    const sphereCorners = sphere.faces.flatMap(face => face.corners).filter(corner => corner.vertexId === 'v1')
    expect(new Set(sphereCorners.map(corner => corner.uv.join(','))).size).toBeGreaterThan(1)
    const cylinderCorners = cylinder.faces.flatMap(face => face.corners).filter(corner => corner.vertexId === 'v0')
    expect(new Set(cylinderCorners.map(corner => corner.normal.y.toFixed(4)))).toEqual(new Set(['0.0000', '1.0000']))
  })

  it('selects separate open components from a test-only two-piece fixture', () => {
    const first = twoQuadOpenFixture()
    const second = prefixMesh(first, 'b')
    const fixture: MeshSnapshot = { vertices: [...first.vertices, ...second.vertices], edges: [...first.edges, ...second.edges],
      faces: [...first.faces, ...second.faces], halfEdges: [...first.halfEdges, ...second.halfEdges] }
    expect(meshElements(fixture)).toHaveLength(2)
    expect(meshBorderEdges(fixture)).toHaveLength(12)
    expect(expandPolySelection(fixture, 'border', meshBorderEdges(first)[0].id)).toHaveLength(6)
    expect(expandPolySelection(fixture, 'element', first.faces[0].id)).toHaveLength(2)
    expect(first.vertices).toHaveLength(6)
    expect(first.edges).toHaveLength(7)
    expect(first.faces).toHaveLength(2)
  })

  it('regenerates the same IDs and triangles after portable parameter serialization', () => {
    const source = { kind: 'sphere' as const, radius: .75 }
    const a = primitiveMeshSnapshot(source)
    const b = primitiveMeshSnapshot(JSON.parse(JSON.stringify(source)))
    expect(b.generatorVersion).toBe(a.generatorVersion)
    expect(b.sourceKind).toBe(a.sourceKind)
    expect(topologyFingerprint(b)).toBe(topologyFingerprint(a))
    expect(b.vertices.map(value => value.id)).toEqual(a.vertices.map(value => value.id))
    expect(b.edges.map(value => value.id)).toEqual(a.edges.map(value => value.id))
    expect(b.faces.map(value => value.id)).toEqual(a.faces.map(value => value.id))
    expect(triangulateConvexMesh(b).map(value => value.faceId)).toEqual(triangulateConvexMesh(a).map(value => value.faceId))
  })

  it.each([
    { kind: 'sphere' as const, radius: .5 },
    { kind: 'cylinder' as const, radius: .5, height: 1 },
    { kind: 'cone' as const, radius: .5, height: 1 },
  ])('makes $kind a closed oriented manifold', geometry => {
    const mesh = primitiveMeshSnapshot(geometry)
    expect(meshBorderEdges(mesh)).toHaveLength(0)
    expect(meshElements(mesh)).toHaveLength(1)
    for (const edge of mesh.edges) {
      expect(edge.halfEdgeIds).toHaveLength(2)
      const [a, b] = edge.halfEdgeIds.map(id => mesh.halfEdges.find(half => half.id === id)!)
      expect([a.from, a.to]).toEqual([b.to, b.from])
    }
  })

  it('combines click selection without modifying the mesh', () => {
    expect(updatePolySelection(['v0'], ['v1'], 'add')).toEqual(['v0', 'v1'])
    expect(updatePolySelection(['v0', 'v1'], ['v0'], 'subtract')).toEqual(['v1'])
    expect(updatePolySelection(['v0'], [], 'replace')).toEqual([])
  })
})

/** Extract adjacent Box quads as an open disk; no primitive source can author
 * this shape yet. The fixture preserves real shared-edge connectivity. */
function twoQuadOpenFixture(): MeshSnapshot {
  const box = primitiveMeshSnapshot({ kind: 'box', width: 1, height: 1, depth: 1 })
  const faces = box.faces.filter(face => face.id === 'f0' || face.id === 'f2')
  const faceIds = new Set(faces.map(face => face.id))
  const retained = box.halfEdges.filter(half => faceIds.has(half.faceId))
  const halfIds = new Set(retained.map(half => half.id))
  const halfEdges = retained.map(half => ({ ...half, twinId: half.twinId && halfIds.has(half.twinId) ? half.twinId : undefined }))
  const edges = box.edges.map(edge => ({ ...edge, halfEdgeIds: edge.halfEdgeIds.filter(id => halfIds.has(id)) })).filter(edge => edge.halfEdgeIds.length)
  const vertexIds = new Set(faces.flatMap(face => face.corners.map(corner => corner.vertexId)))
  const vertices = box.vertices.filter(vertex => vertexIds.has(vertex.id)).map(vertex => ({ ...vertex,
    outgoingHalfEdgeId: halfEdges.find(half => half.from === vertex.id)?.id }))
  return { vertices, edges, faces, halfEdges }
}

/** Test fixture remaps every stable reference while leaving geometry untouched. */
function prefixMesh(mesh: MeshSnapshot, prefix: string): MeshSnapshot {
  const id = (value: string | undefined) => value ? `${prefix}${value}` : undefined
  return {
    vertices: mesh.vertices.map(vertex => ({ ...vertex, id: id(vertex.id)!, outgoingHalfEdgeId: id(vertex.outgoingHalfEdgeId) })),
    edges: mesh.edges.map(edge => ({ ...edge, id: id(edge.id)!, vertices: [id(edge.vertices[0])!, id(edge.vertices[1])!] as const,
      halfEdgeIds: edge.halfEdgeIds.map(value => id(value)!) })),
    faces: mesh.faces.map(face => ({ ...face, id: id(face.id)!, outerHalfEdgeId: id(face.outerHalfEdgeId)!,
      corners: face.corners.map(corner => ({ ...corner, halfEdgeId: id(corner.halfEdgeId)!, vertexId: id(corner.vertexId)! })) })),
    halfEdges: mesh.halfEdges.map(half => ({ ...half, id: id(half.id)!, edgeId: id(half.edgeId)!, faceId: id(half.faceId)!,
      from: id(half.from)!, to: id(half.to)!, nextId: id(half.nextId)!, prevId: id(half.prevId)!, twinId: id(half.twinId) })),
  }
}
