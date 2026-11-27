import { ringArea } from '../planar/contours'
import type { Mesh2DGeometry } from '@/lib/types/mesh2d'
import { Mesh2DAdjacencyBuilder } from './Mesh2DAdjacencyBuilder'
import { Mesh2DTopologyValidator } from './Mesh2DTopologyValidator'

const EPSILON = 1e-8

export interface Mesh2DBoundaryRing {
  readonly vertexIndices: readonly number[]
  readonly points: readonly { readonly x: number; readonly y: number }[]
  readonly signedDoubleArea: number
  readonly parentIndex: number | null
  readonly depth: number
  readonly role: 'outer' | 'hole'
}

/**
 * Extracts deterministic outer/hole rings from validated Mesh2D topology.
 *
 * Geometry uses layer-local x-right/y-down pixels. Every boundary vertex must
 * have degree two; open, branching and non-manifold boundaries fail instead of
 * being guessed. Containment depth classifies even-odd outer/hole roles, so
 * disconnected islands and nested holes remain explicit. Outer rings are
 * normalized to positive signed area and holes to negative signed area.
 * Instances retain no geometry or adjacency arrays.
 */
export class Mesh2DBoundaryRingExtractor {
  constructor(
    private readonly validator = new Mesh2DTopologyValidator(),
    private readonly adjacencyBuilder = new Mesh2DAdjacencyBuilder(),
  ) {}

  /** Returns detached immutable rings without mutating the borrowed geometry. */
  extract(geometry: Mesh2DGeometry): readonly Mesh2DBoundaryRing[] {
    const validation = this.validator.validate(geometry)
    if (!validation.valid) {
      const codes = validation.diagnostics.filter(item => item.severity === 'error').map(item => item.code)
      throw new Error(`Mesh2D boundary topology is invalid: ${codes.join(', ')}`)
    }
    const boundaryEdges = this.adjacencyBuilder.build(geometry.topology).boundaryEdges
    if (boundaryEdges.length < 3) throw new Error('Mesh2D geometry has no closed boundary.')
    const neighbors = new Map<number, number[]>()
    boundaryEdges.forEach(edge => {
      const [a, b] = edge.vertices
      neighbors.set(a, [...(neighbors.get(a) ?? []), b])
      neighbors.set(b, [...(neighbors.get(b) ?? []), a])
    })
    if (Array.from(neighbors.values()).some(items => items.length !== 2)) {
      throw new Error('Mesh2D boundary is open or branches.')
    }

    const remaining = new Set(boundaryEdges.map(edgeKey))
    const working: WorkingRing[] = []
    while (remaining.size) {
      const firstEdge = Array.from(remaining).sort(compareEdgeKeys)[0]
      const [firstA, firstB] = parseEdgeKey(firstEdge)
      const start = Math.min(firstA, firstB)
      const indices = [start]
      let previous = -1
      let current = start
      while (indices.length <= boundaryEdges.length) {
        const options = neighbors.get(current)!.filter(index => index !== previous).sort((a, b) => a - b)
        const next = options.find(index => remaining.has(edgeKeyFromVertices(current, index)))
        if (next === undefined) throw new Error('Mesh2D boundary traversal did not close.')
        remaining.delete(edgeKeyFromVertices(current, next))
        if (next === start) break
        if (indices.includes(next)) throw new Error('Mesh2D boundary contains a repeated vertex.')
        indices.push(next)
        previous = current
        current = next
      }
      if (indices.length < 3) throw new Error('Mesh2D boundary ring needs at least three vertices.')
      const points = indices.map(index => pointAt(geometry, index))
      const signedDoubleArea = area2(points)
      if (Math.abs(signedDoubleArea) <= EPSILON) throw new Error('Mesh2D boundary ring has zero area.')
      working.push({ indices, points, signedDoubleArea, parentIndex: null, depth: 0 })
    }

    assignContainment(working)
    return Object.freeze(working.map(ring => freezeRing(ring)))
  }
}

interface WorkingRing {
  indices: number[]
  points: { x: number; y: number }[]
  signedDoubleArea: number
  parentIndex: number | null
  depth: number
}

function assignContainment(rings: WorkingRing[]): void {
  rings.forEach((ring, ringIndex) => {
    let parentIndex: number | null = null
    let parentArea = Infinity
    rings.forEach((candidate, candidateIndex) => {
      if (candidateIndex === ringIndex || Math.abs(candidate.signedDoubleArea) <= Math.abs(ring.signedDoubleArea)) return
      if (pointInPolygon(ring.points[0], candidate.points) && Math.abs(candidate.signedDoubleArea) < parentArea) {
        parentIndex = candidateIndex
        parentArea = Math.abs(candidate.signedDoubleArea)
      }
    })
    ring.parentIndex = parentIndex
  })
  const depthOf = (index: number, visited = new Set<number>()): number => {
    if (visited.has(index)) throw new Error('Mesh2D boundary containment cycle detected.')
    visited.add(index)
    const parent = rings[index].parentIndex
    return parent === null ? 0 : depthOf(parent, visited) + 1
  }
  rings.forEach((ring, index) => { ring.depth = depthOf(index) })
}

function freezeRing(ring: WorkingRing): Mesh2DBoundaryRing {
  const role = ring.depth % 2 === 0 ? 'outer' : 'hole'
  const shouldReverse = role === 'outer' ? ring.signedDoubleArea < 0 : ring.signedDoubleArea > 0
  const indices = shouldReverse ? [...ring.indices].reverse() : [...ring.indices]
  const points = shouldReverse ? [...ring.points].reverse() : [...ring.points]
  const signedDoubleArea = shouldReverse ? -ring.signedDoubleArea : ring.signedDoubleArea
  return Object.freeze({
    vertexIndices: Object.freeze(indices),
    points: Object.freeze(points.map(point => Object.freeze({ ...point }))),
    signedDoubleArea,
    parentIndex: ring.parentIndex,
    depth: ring.depth,
    role,
  })
}

function pointAt(geometry: Mesh2DGeometry, index: number): { x: number; y: number } {
  return { x: geometry.positions[index * 2], y: geometry.positions[index * 2 + 1] }
}

/** Shared translated-origin area avoids cancellation for distant local meshes. */
function area2(points: readonly { readonly x: number; readonly y: number }[]): number {
  return 2 * ringArea(points)
}

function pointInPolygon(
  point: { readonly x: number; readonly y: number },
  ring: readonly { readonly x: number; readonly y: number }[],
): boolean {
  let inside = false
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const a = ring[current], b = ring[previous]
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

function edgeKey(edge: { readonly vertices: readonly [number, number] }): string {
  return edgeKeyFromVertices(edge.vertices[0], edge.vertices[1])
}

function edgeKeyFromVertices(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

function parseEdgeKey(value: string): [number, number] {
  const [a, b] = value.split(':').map(Number)
  return [a, b]
}

function compareEdgeKeys(left: string, right: string): number {
  const [leftA, leftB] = parseEdgeKey(left)
  const [rightA, rightB] = parseEdgeKey(right)
  return leftA - rightA || leftB - rightB
}
