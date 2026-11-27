import { BufferGeometry, Float32BufferAttribute } from 'three'
import type { MeshSnapshot } from './meshSnapshot'
import { triangulateConvexMesh } from './meshTriangulation'

/** Three adapter for a logical primitive snapshot. Render vertices are
 * deliberately duplicated at UV/normal boundaries while corner.vertexId
 * continues to identify the same geometric point across those boundaries.
 * Returned geometry is owned and disposed by PrimitiveScene. */
export function primitiveRenderGeometry(mesh: MeshSnapshot): BufferGeometry {
  const positionById = new Map(mesh.vertices.map(vertex => [vertex.id, vertex.position]))
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], faceIds: string[] = []
  for (const triangle of triangulateConvexMesh(mesh)) {
    faceIds.push(triangle.faceId)
    for (const corner of triangle.corners) {
      const point = positionById.get(corner.vertexId)
      if (!point) throw new Error(`Missing logical vertex ${corner.vertexId}.`)
      positions.push(point.x, point.y, point.z)
      normals.push(corner.normal.x, corner.normal.y, corner.normal.z)
      uvs.push(corner.uv[0], corner.uv[1])
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.userData.choronoFaceIds = faceIds
  geometry.computeBoundingBox(); geometry.computeBoundingSphere()
  return geometry
}
