import { Mesh, OrthographicCamera, PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three'
import type { MeshSnapshot } from './meshSnapshot'
import type { PolyProjection, PolySelectionMode, PolyScreenPoint } from './editSelection'
import { triangulateConvexMesh } from './meshTriangulation'

type Camera = PerspectiveCamera | OrthographicCamera

/** Renderer adapter for authored mesh selection. It borrows a configured Three
 * mesh/camera, owns no GPU data, and returns only CSS-pixel/plain-data results.
 * Convex primitive faces are tested as logical polygons; their fan diagonals
 * never become editable edges. */
export class PrimitivePolyView {
  constructor(private readonly mesh: Mesh, private readonly camera: Camera, private readonly topology: MeshSnapshot,
    private readonly width: number, private readonly height: number) { this.mesh.updateWorldMatrix(true, false) }

  /** Project all local-metre vertices and front-facing logical faces. */
  project(): PolyProjection {
    const vertices: Record<string, PolyScreenPoint> = {}
    for (const vertex of this.topology.vertices) {
      const point = this.world(vertex.id).project(this.camera)
      vertices[vertex.id] = { x: (point.x + 1) * this.width / 2, y: (1 - point.y) * this.height / 2, depth: point.z }
    }
    const visibleFaces = this.topology.faces.filter(face => {
      const ids = face.corners.map(corner => corner.vertexId)
      const a = this.world(ids[0]), b = this.world(ids[1]), c = this.world(ids[2])
      const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize()
      const towardCamera = this.camera instanceof OrthographicCamera
        ? this.camera.getWorldDirection(new Vector3()).negate()
        : this.camera.position.clone().sub(a).normalize()
      return normal.dot(towardCamera) > 1e-5 || this.topology.faces.length === 1
    }).map(face => face.id)
    return { vertices, visibleFaces }
  }

  /** Pick a projected component. Faces use ray/triangle intersections in world
   * space; vertices and edges use a 10 CSS-pixel tolerance on visible faces. */
  pick(mode: PolySelectionMode, x: number, y: number): string | null {
    const projection = this.project(), visible = new Set(projection.visibleFaces)
    const vertexIds = new Set<string>(), edgeIds = new Set<string>()
    for (const face of this.topology.faces) if (visible.has(face.id)) {
      for (const corner of face.corners) vertexIds.add(corner.vertexId)
      for (const edge of this.topology.edges) if (edge.halfEdgeIds.some(id => this.topology.halfEdges.find(half => half.id === id)?.faceId === face.id)) edgeIds.add(edge.id)
    }
    if (mode === 'vertex') {
      let best = 10, result: string | null = null
      for (const id of Array.from(vertexIds)) { const p = projection.vertices[id], d = Math.hypot(p.x - x, p.y - y); if (p.depth >= -1 && p.depth <= 1 && d < best) { best = d; result = id } }
      return result
    }
    if (mode === 'edge' || mode === 'border') {
      let best = 9, result: string | null = null
      for (const edge of this.topology.edges) {
        if (!edgeIds.has(edge.id) || mode === 'border' && edge.halfEdgeIds.length !== 1) continue
        const a = projection.vertices[edge.vertices[0]], b = projection.vertices[edge.vertices[1]]
        if (a.depth < -1 || a.depth > 1 || b.depth < -1 || b.depth > 1) continue
        const d = pointToSegment(x, y, a, b)
        if (d < best) { best = d; result = edge.id }
      }
      return result
    }
    const ray = new Raycaster(); ray.setFromCamera(new Vector2(x / this.width * 2 - 1, 1 - y / this.height * 2), this.camera)
    let nearest = Infinity, result: string | null = null
    for (const triangle of triangulateConvexMesh(this.topology)) {
      const [a, b, c] = triangle.corners.map(corner => this.world(corner.vertexId))
      const hit = ray.ray.intersectTriangle(a, b, c, false, new Vector3())
      if (!hit) continue
      const distance = ray.ray.origin.distanceTo(hit)
      if (distance < nearest) { nearest = distance; result = triangle.faceId }
    }
    return result
  }

  private world(id: string): Vector3 {
    const position = this.topology.vertices.find(vertex => vertex.id === id)!.position
    return this.mesh.localToWorld(new Vector3(position.x, position.y, position.z))
  }
}

/** Euclidean distance from a screen point to a finite screen segment. */
function pointToSegment(x: number, y: number, a: PolyScreenPoint, b: PolyScreenPoint): number {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy
  const t = length ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / length)) : 0
  return Math.hypot(x - a.x - t * dx, y - a.y - t * dy)
}
