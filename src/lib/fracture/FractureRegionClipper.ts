import {
  Mesh2DBoundaryRingExtractor,
  Mesh2DTopologyHasher,
  Mesh2DTopologyValidator,
} from '@/lib/geometry/mesh2d'
import type { Mesh2DGeometry, Mesh2DTopology } from '@/lib/types/mesh2d'
import type { FractureBounds2D, FracturePoint2D } from '@/lib/types/fracture'
import { ConvexPolygon2D } from './ConvexPolygon2D'

const EPSILON = 1e-8
const POSITION_SCALE = 1e8

interface ClippedVertex extends FracturePoint2D {
  readonly u: number
  readonly v: number
}

interface ClippedPiece {
  readonly sourceTriangleIndex: number
  readonly vertices: readonly ClippedVertex[]
}

export interface FractureRegionBoundaryRing {
  readonly points: readonly FracturePoint2D[]
  readonly signedDoubleArea: number
  readonly parentIndex: number | null
  readonly depth: number
  readonly role: 'outer' | 'hole'
}

/** One edge-connected intersection component inside a convex clip polygon. */
export interface FractureClippedRegionComponent {
  readonly geometry: Mesh2DGeometry
  /** Non-overlapping convex polygons suitable for a compound rigid collider. */
  readonly colliderParts: readonly (readonly FracturePoint2D[])[]
  readonly boundaryRings: readonly FractureRegionBoundaryRing[]
  readonly centroidPx: FracturePoint2D
  readonly boundsPx: FractureBounds2D
  readonly areaPx2: number
}

/**
 * Intersects validated Mesh2D triangles with one convex polygon.
 *
 * Every source triangle is clipped independently so authored UV seams remain
 * intact. Result polygons sharing a non-zero boundary edge are grouped into
 * one component; point-only contact does not merge physical bodies. The same
 * polygons form non-overlapping convex collider parts, while a welded
 * position-only view derives outer/hole boundary rings. Instances retain no
 * source arrays or scratch buffers between calls.
 */
export class FractureRegionClipper {
  constructor(
    private readonly hasher = new Mesh2DTopologyHasher(),
    private readonly validator = new Mesh2DTopologyValidator(),
    private readonly ringExtractor = new Mesh2DBoundaryRingExtractor(),
  ) {}

  /**
   * Returns detached immutable components in deterministic triangle order.
   * The source and clip polygon use layer-local composition pixels.
   */
  clip(
    source: Mesh2DGeometry,
    clipPolygon: readonly FracturePoint2D[],
    idPrefix: string,
  ): readonly FractureClippedRegionComponent[] {
    const validation = this.validator.validate(source)
    if (!validation.valid) {
      throw new Error(`Fracture source Mesh2D is invalid: ${errorCodes(validation).join(', ')}`)
    }
    const clip = new ConvexPolygon2D(clipPolygon, 'Fracture region clip polygon')
    const pieces: ClippedPiece[] = []
    for (let offset = 0; offset < source.topology.triangleIndices.length; offset += 3) {
      const vertices = clipTriangle(readTriangle(source, offset), clip.points)
      if (vertices.length >= 3 && signedDoubleArea(vertices) > EPSILON) {
        pieces.push(Object.freeze({ sourceTriangleIndex: offset / 3, vertices: freezeVertices(vertices) }))
      }
    }
    if (!pieces.length) return Object.freeze([])
    const groups = connectedPieceGroups(pieces)
    return Object.freeze(groups.map((indices, componentIndex) => this.buildComponent(
      pieces,
      indices,
      `${idPrefix}-component-${componentIndex}`,
    )))
  }

  private buildComponent(
    allPieces: readonly ClippedPiece[],
    pieceIndices: readonly number[],
    idPrefix: string,
  ): FractureClippedRegionComponent {
    const pieces = pieceIndices.map(index => allPieces[index])
    const geometry = this.buildRenderGeometry(pieces, idPrefix)
    const boundaryRings = this.buildBoundaryRings(pieces, idPrefix)
    const metrics = integratePieces(pieces)
    return Object.freeze({
      geometry,
      colliderParts: Object.freeze(pieces.map(piece => Object.freeze(
        piece.vertices.map(vertex => Object.freeze({ x: vertex.x, y: vertex.y })),
      ))),
      boundaryRings,
      ...metrics,
    })
  }

  private buildRenderGeometry(pieces: readonly ClippedPiece[], idPrefix: string): Mesh2DGeometry {
    const positions: number[] = [], uvs: number[] = [], vertexIds: string[] = [], triangleIndices: number[] = []
    pieces.forEach((piece, pieceIndex) => {
      const base = positions.length / 2
      piece.vertices.forEach((vertex, vertexIndex) => {
        positions.push(vertex.x, vertex.y)
        uvs.push(vertex.u, vertex.v)
        vertexIds.push(`${idPrefix}-triangle-${piece.sourceTriangleIndex}-piece-${pieceIndex}-vertex-${vertexIndex}`)
      })
      appendFan(triangleIndices, base, piece.vertices.length)
    })
    const geometry = createGeometry(positions, uvs, vertexIds, triangleIndices, this.hasher)
    const validation = this.validator.validate(geometry)
    if (!validation.valid) {
      throw new Error(`Fracture clipped component is invalid: ${errorCodes(validation).join(', ')}`)
    }
    return geometry
  }

  private buildBoundaryRings(
    pieces: readonly ClippedPiece[],
    idPrefix: string,
  ): readonly FractureRegionBoundaryRing[] {
    const positions: number[] = [], uvs: number[] = [], vertexIds: string[] = [], triangleIndices: number[] = []
    const vertexByPosition = new Map<string, number>()
    pieces.forEach(piece => {
      const indices = piece.vertices.map(vertex => {
        const key = pointKey(vertex)
        const existing = vertexByPosition.get(key)
        if (existing !== undefined) return existing
        const index = positions.length / 2
        vertexByPosition.set(key, index)
        positions.push(vertex.x, vertex.y)
        uvs.push(0, 0)
        vertexIds.push(`${idPrefix}-welded-${index}`)
        return index
      })
      for (let index = 1; index < indices.length - 1; index++) {
        triangleIndices.push(indices[0], indices[index], indices[index + 1])
      }
    })
    const welded = createGeometry(positions, uvs, vertexIds, triangleIndices, this.hasher)
    return Object.freeze(this.ringExtractor.extract(welded).map(ring => Object.freeze({
      points: ring.points,
      signedDoubleArea: ring.signedDoubleArea,
      parentIndex: ring.parentIndex,
      depth: ring.depth,
      role: ring.role,
    })))
  }
}

function connectedPieceGroups(pieces: readonly ClippedPiece[]): readonly (readonly number[])[] {
  const ownersByEdge = new Map<string, number[]>()
  pieces.forEach((piece, pieceIndex) => {
    piece.vertices.forEach((vertex, index) => {
      const next = piece.vertices[(index + 1) % piece.vertices.length]
      if (samePoint(vertex, next)) return
      const key = edgeKey(vertex, next)
      ownersByEdge.set(key, [...(ownersByEdge.get(key) ?? []), pieceIndex])
    })
  })
  const adjacency = pieces.map(() => new Set<number>())
  ownersByEdge.forEach(owners => {
    for (let left = 0; left < owners.length; left++) {
      for (let right = left + 1; right < owners.length; right++) {
        adjacency[owners[left]].add(owners[right])
        adjacency[owners[right]].add(owners[left])
      }
    }
  })
  const unseen = new Set(pieces.map((_, index) => index))
  const groups: number[][] = []
  while (unseen.size) {
    const start = Math.min(...Array.from(unseen)), queue = [start], group: number[] = []
    unseen.delete(start)
    while (queue.length) {
      const current = queue.shift()!
      group.push(current)
      Array.from(adjacency[current]).sort((a, b) => a - b).forEach(next => {
        if (unseen.delete(next)) queue.push(next)
      })
    }
    groups.push(group.sort((a, b) => a - b))
  }
  return groups
}

function integratePieces(pieces: readonly ClippedPiece[]): Pick<
  FractureClippedRegionComponent, 'areaPx2' | 'centroidPx' | 'boundsPx'
> {
  let doubleAreaSum = 0, weightedX = 0, weightedY = 0
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  pieces.forEach(piece => {
    const area2 = signedDoubleArea(piece.vertices)
    const centroid = polygonCentroid(piece.vertices, area2)
    doubleAreaSum += area2
    weightedX += centroid.x * area2
    weightedY += centroid.y * area2
    piece.vertices.forEach(point => {
      minX = Math.min(minX, point.x); minY = Math.min(minY, point.y)
      maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y)
    })
  })
  return {
    areaPx2: doubleAreaSum / 2,
    centroidPx: Object.freeze({ x: weightedX / doubleAreaSum, y: weightedY / doubleAreaSum }),
    boundsPx: Object.freeze({ minX, minY, maxX, maxY }),
  }
}

function polygonCentroid(points: readonly FracturePoint2D[], area2: number): FracturePoint2D {
  let x = 0, y = 0
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length]
    const crossValue = point.x * next.y - next.x * point.y
    x += (point.x + next.x) * crossValue
    y += (point.y + next.y) * crossValue
  })
  return { x: x / (3 * area2), y: y / (3 * area2) }
}

function createGeometry(
  positions: number[],
  uvs: number[],
  vertexIds: string[],
  triangleIndices: number[],
  hasher: Mesh2DTopologyHasher,
): Mesh2DGeometry {
  const topologyWithoutHash: Omit<Mesh2DTopology, 'topologyHash'> = { schemaVersion: 1, vertexIds, triangleIndices }
  return Object.freeze({
    positions: Object.freeze(positions),
    uvs: Object.freeze(uvs),
    topology: Object.freeze({ ...topologyWithoutHash, topologyHash: hasher.hash(topologyWithoutHash) }),
  })
}

function appendFan(indices: number[], base: number, count: number): void {
  for (let index = 1; index < count - 1; index++) indices.push(base, base + index, base + index + 1)
}

function readTriangle(geometry: Mesh2DGeometry, offset: number): ClippedVertex[] {
  return geometry.topology.triangleIndices.slice(offset, offset + 3).map(index => ({
    x: geometry.positions[index * 2], y: geometry.positions[index * 2 + 1],
    u: geometry.uvs[index * 2], v: geometry.uvs[index * 2 + 1],
  }))
}

function clipTriangle(subject: readonly ClippedVertex[], clip: readonly FracturePoint2D[]): ClippedVertex[] {
  let output = subject.map(vertex => ({ ...vertex }))
  for (let edgeIndex = 0; edgeIndex < clip.length && output.length; edgeIndex++) {
    const edgeStart = clip[edgeIndex], edgeEnd = clip[(edgeIndex + 1) % clip.length], input = output
    output = []
    input.forEach((start, index) => {
      const end = input[(index + 1) % input.length]
      const startInside = cross(edgeStart, edgeEnd, start) >= -EPSILON
      const endInside = cross(edgeStart, edgeEnd, end) >= -EPSILON
      if (startInside && endInside) output.push(end)
      else if (startInside) output.push(intersection(start, end, edgeStart, edgeEnd))
      else if (endInside) output.push(intersection(start, end, edgeStart, edgeEnd), end)
    })
    output = normalize(output)
  }
  if (signedDoubleArea(output) < 0) output.reverse()
  return output
}

function intersection(
  start: ClippedVertex,
  end: ClippedVertex,
  edgeStart: FracturePoint2D,
  edgeEnd: FracturePoint2D,
): ClippedVertex {
  const segmentX = end.x - start.x, segmentY = end.y - start.y
  const edgeX = edgeEnd.x - edgeStart.x, edgeY = edgeEnd.y - edgeStart.y
  const denominator = segmentX * edgeY - segmentY * edgeX
  if (Math.abs(denominator) <= EPSILON) return { ...end }
  const t = Math.max(0, Math.min(1,
    ((edgeStart.x - start.x) * edgeY - (edgeStart.y - start.y) * edgeX) / denominator))
  return {
    x: clean(start.x + segmentX * t), y: clean(start.y + segmentY * t),
    u: start.u + (end.u - start.u) * t, v: start.v + (end.v - start.v) * t,
  }
}

function normalize(input: readonly ClippedVertex[]): ClippedVertex[] {
  const vertices: ClippedVertex[] = []
  input.forEach(vertex => {
    if (!vertices.length || !samePoint(vertices.at(-1)!, vertex)) vertices.push({ ...vertex })
  })
  if (vertices.length > 1 && samePoint(vertices[0], vertices.at(-1)!)) vertices.pop()
  let changed = true
  while (changed && vertices.length > 3) {
    changed = false
    for (let index = 0; index < vertices.length; index++) {
      const previous = vertices[(index + vertices.length - 1) % vertices.length]
      const current = vertices[index], next = vertices[(index + 1) % vertices.length]
      if (Math.abs(cross(previous, current, next)) <= EPSILON) {
        vertices.splice(index, 1); changed = true; break
      }
    }
  }
  return vertices
}

function freezeVertices(vertices: readonly ClippedVertex[]): readonly ClippedVertex[] {
  return Object.freeze(vertices.map(vertex => Object.freeze({ ...vertex })))
}

function signedDoubleArea(points: readonly FracturePoint2D[]): number {
  let area = 0
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length]
    area += point.x * next.y - next.x * point.y
  })
  return area
}

function cross(start: FracturePoint2D, end: FracturePoint2D, point: FracturePoint2D): number {
  return (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x)
}

function pointKey(point: FracturePoint2D): string {
  return `${Math.round(point.x * POSITION_SCALE)}:${Math.round(point.y * POSITION_SCALE)}`
}

function edgeKey(left: FracturePoint2D, right: FracturePoint2D): string {
  const a = pointKey(left), b = pointKey(right)
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function samePoint(left: FracturePoint2D, right: FracturePoint2D): boolean {
  return Math.abs(left.x - right.x) <= EPSILON && Math.abs(left.y - right.y) <= EPSILON
}

function clean(value: number): number {
  const rounded = Math.round(value * 1e9) / 1e9
  return Object.is(rounded, -0) ? 0 : rounded
}

function errorCodes(result: ReturnType<Mesh2DTopologyValidator['validate']>): string[] {
  return result.diagnostics.filter(item => item.severity === 'error').map(item => item.code)
}
