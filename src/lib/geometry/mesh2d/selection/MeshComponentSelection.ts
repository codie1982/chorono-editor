import type { Mesh2DGeometry, Mesh2DSource } from '../../../types/mesh2d'
import { Matrix2D } from '../../Matrix2D'
import { Mesh2DAdjacencyBuilder } from '../Mesh2DAdjacencyBuilder'
import { distToSegmentSq } from '../../segmentDistance'
import type { SelectionRegion } from '../../../selection/selectionGesture'
import { regionContains, regionPolygon } from '../../../selection/regionGeometry'
import { segmentsIntersect } from '../../../selection/canvasShapes'
import { MeshFaceTopology, meshEdgeKey, type MeshEditFace } from './MeshFaceTopology'
import { meshFaceContains, meshFaceInRegion } from './faceRegion'
type Point = { x: number; y: number }
export type MeshComponentMode = 'point' | 'edge' | 'face'

/** Immutable evaluated selection view for one validated fixed-topology mesh.
 * Connectivity uses the canonical adjacency builder; coordinates are world
 * composition pixels, so nonuniform parents do not distort hit tolerances.
 * Borrows geometry, owns derived points/edges, no scene/history/browser state. */
export class MeshComponentSelection {
  readonly points: readonly (Point & { id: string })[]
  readonly edges: readonly { id: string; a: number; b: number }[]
  readonly faces: readonly MeshEditFace[]
  constructor(private readonly geometry: Mesh2DGeometry, matrix: Matrix2D, legacySource?: Mesh2DSource) {
    this.points = geometry.topology.vertexIds.map((id, i) => ({ id,
      ...matrix.applyToPoint({ x: geometry.positions[i * 2], y: geometry.positions[i * 2 + 1] }) }))
    const topology = new MeshFaceTopology(geometry, legacySource)
    this.faces = topology.faces
    this.edges = new Mesh2DAdjacencyBuilder().build(geometry.topology).edges.filter(edge => !topology.hiddenDiagonals.has(meshEdgeKey(...edge.vertices))).map(edge => ({
      id: JSON.stringify(edge.vertices.map(i => this.points[i].id)), a: edge.vertices[0], b: edge.vertices[1] }))
  }
  /** Nearest point/edge within world-pixel tolerance (last-item ties). Faces
   * use exact containment with first-face boundary ties, never radius expansion
   * into a hole or outside the material. Source records are not changed. */
  pick(mode: MeshComponentMode, point: Point, radius: number): string | null {
    if (mode === 'face') return this.faces.find(face => meshFaceContains(face.vertices.map(i => this.points[i]), point))?.id ?? null
    let found: string | null = null, distance = radius * radius
    if (mode === 'point') for (const candidate of this.points) {
      const d = (candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2
      if (d <= distance) { distance = d; found = candidate.id }
    }
    else for (const edge of this.edges) {
      const a = this.points[edge.a], b = this.points[edge.b]
      const d = distToSegmentSq(point.x, point.y, a.x, a.y, b.x, b.y).dSq
      if (d <= distance) { distance = d; found = edge.id }
    }
    return found
  }
  /** Stable vertex IDs, unique even for edges sharing an endpoint. */
  vertices(mode: MeshComponentMode, ids: readonly string[]): string[] {
    const selected = new Set(ids)
    if (mode === 'point') return this.points.filter(point => selected.has(point.id)).map(point => point.id)
    const indices = new Set(mode === 'face' ? this.faces.filter(face => selected.has(face.id)).flatMap(face => face.vertices)
      : this.edges.filter(edge => selected.has(edge.id)).flatMap(edge => [edge.a, edge.b]))
    return this.points.filter((_, index) => indices.has(index)).map(point => point.id)
  }
  /** Bounds center in source-local pixels, used by native Rotate/Scale sessions. */
  pivot(ids: readonly string[]): Point | null {
    const wanted = new Set(ids), points = this.geometry.topology.vertexIds.flatMap((id, index) => wanted.has(id)
      ? [{ x: this.geometry.positions[index * 2], y: this.geometry.positions[index * 2 + 1] }] : [])
    if (!points.length) return null
    const bounds = points.reduce((box, p) => ({ x0: Math.min(box.x0, p.x), y0: Math.min(box.y0, p.y), x1: Math.max(box.x1, p.x), y1: Math.max(box.y1, p.y) }),
      { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity })
    return { x: (bounds.x0 + bounds.x1) / 2, y: (bounds.y0 + bounds.y1) / 2 }
  }
  /** Exact point/straight-edge/face region membership. Face crossing includes
   * regions entirely inside its polygon. Inside also checks concave lasso edge
   * intervals; shared distance predicates serve circle and paint brushes. */
  query(mode: MeshComponentMode, region: SelectionRegion, containment: 'inside' | 'touching'): Set<string> {
    if (mode === 'face') return new Set(this.faces.filter(face => meshFaceInRegion(face.vertices.map(i => this.points[i]), region, containment)).map(face => face.id))
    if (mode === 'point') return new Set(this.points.filter(point => regionContains(region, point)).map(point => point.id))
    const polygon = regionPolygon(region)
    return new Set(this.edges.filter(edge => {
      const a = this.points[edge.a], b = this.points[edge.b], first = regionContains(region, a), second = regionContains(region, b)
      if (containment === 'inside' && region.kind !== 'paint') return first && second
      if (first || second) return true
      if (region.kind === 'circle' || region.kind === 'paint') return distToSegmentSq(region.cx, region.cy, a.x, a.y, b.x, b.y).dSq <= region.r ** 2
      return polygon.some((point, i) => segmentsIntersect(a, b, point, polygon[(i + 1) % polygon.length]))
    }).map(edge => edge.id))
  }
}
