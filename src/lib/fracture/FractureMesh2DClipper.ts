import { Mesh2DTopologyHasher, Mesh2DTopologyValidator } from '@/lib/geometry/mesh2d'
import type { FragmentGeometry, FracturePoint2D } from '@/lib/types/fracture'
import type { Mesh2DData, Mesh2DGeometry, Mesh2DTopology } from '@/lib/types/mesh2d'
import { ConvexPolygon2D } from './ConvexPolygon2D'

const EPSILON = 1e-8

interface MeshVertex extends FracturePoint2D {
  readonly u: number
  readonly v: number
}

/**
 * Clips one validated source Mesh2D into a convex fracture fragment.
 *
 * Each source triangle is independently clipped by the fragment boundary with
 * Sutherland–Hodgman half planes. UVs are interpolated on every new edge
 * vertex, so arbitrary authored UV seams and texture transforms remain in the
 * same source space. Output intentionally keeps per-triangle vertices instead
 * of welding across UV seams. Instances retain no arrays or renderer handles.
 */
export class FractureMesh2DClipper {
  constructor(
    private readonly hasher = new Mesh2DTopologyHasher(),
    private readonly validator = new Mesh2DTopologyValidator(),
  ) {}

  /**
   * Returns detached portable fragment geometry without mutating the source.
   * Degenerate numerical intersections are removed; an area mismatch fails
   * explicitly rather than publishing a fragment with a visual hole.
   */
  clip(
    source: Mesh2DData,
    sourceLayerId: string,
    generationId: string,
    fragment: FragmentGeometry,
    sourceAppearanceHash: string,
  ): Mesh2DData {
    const sourceValidation = this.validator.validate(source.geometry)
    if (!sourceValidation.valid) {
      throw new Error(`Fracture source Mesh2D is invalid: ${errorCodes(sourceValidation).join(', ')}`)
    }
    const boundary = new ConvexPolygon2D(fragment.polygon, `Fracture fragment ${fragment.id}`)
    const positions: number[] = []
    const uvs: number[] = []
    const vertexIds: string[] = []
    const triangleIndices: number[] = []
    let clippedArea = 0

    for (let offset = 0; offset < source.geometry.topology.triangleIndices.length; offset += 3) {
      const sourceTriangleIndex = offset / 3
      const polygon = clipTriangle(readTriangle(source.geometry, offset), boundary.points)
      if (polygon.length < 3) continue
      const area = signedDoubleArea(polygon) / 2
      if (area <= EPSILON) continue
      clippedArea += area
      const base = positions.length / 2
      polygon.forEach((vertex, vertexIndex) => {
        positions.push(vertex.x, vertex.y)
        uvs.push(vertex.u, vertex.v)
        vertexIds.push(`${fragment.id}-triangle-${sourceTriangleIndex}-vertex-${vertexIndex}`)
      })
      for (let index = 1; index < polygon.length - 1; index++) {
        triangleIndices.push(base, base + index, base + index + 1)
      }
    }

    const tolerance = Math.max(1e-5, boundary.area * 1e-7)
    if (!positions.length || Math.abs(clippedArea - boundary.area) > tolerance) {
      throw new Error(`Fracture Mesh2D clipping does not preserve fragment area (${clippedArea} vs ${boundary.area})`)
    }
    const topologyWithoutHash: Omit<Mesh2DTopology, 'topologyHash'> = {
      schemaVersion: 1,
      vertexIds,
      triangleIndices,
    }
    const topology: Mesh2DTopology = {
      ...topologyWithoutHash,
      topologyHash: this.hasher.hash(topologyWithoutHash),
    }
    const mesh: Mesh2DData = {
      schemaVersion: 1,
      source: {
        kind: 'fractureFragment',
        sourceLayerId,
        generationId,
        fragmentId: fragment.id,
        sourceAppearanceHash,
        generatorVersion: 1,
      },
      geometry: {
        positions,
        uvs,
        topology,
        ...(source.geometry.textureReferenceBounds
          ? { textureReferenceBounds: { ...source.geometry.textureReferenceBounds } }
          : {}),
      },
      ...(source.appearance ? { appearance: structuredClone(source.appearance) } : {}),
    }
    const outputValidation = this.validator.validate(mesh.geometry)
    if (!outputValidation.valid) {
      throw new Error(`Fracture fragment generated invalid Mesh2D topology: ${errorCodes(outputValidation).join(', ')}`)
    }
    return mesh
  }
}

function readTriangle(geometry: Mesh2DGeometry, offset: number): MeshVertex[] {
  return geometry.topology.triangleIndices.slice(offset, offset + 3).map(index => ({
    x: geometry.positions[index * 2],
    y: geometry.positions[index * 2 + 1],
    u: geometry.uvs[index * 2],
    v: geometry.uvs[index * 2 + 1],
  }))
}

function clipTriangle(subject: readonly MeshVertex[], clip: readonly FracturePoint2D[]): MeshVertex[] {
  let output = subject.map(vertex => ({ ...vertex }))
  for (let edgeIndex = 0; edgeIndex < clip.length && output.length; edgeIndex++) {
    const edgeStart = clip[edgeIndex]
    const edgeEnd = clip[(edgeIndex + 1) % clip.length]
    const input = output
    output = []
    for (let index = 0; index < input.length; index++) {
      const start = input[index]
      const end = input[(index + 1) % input.length]
      const startInside = cross(edgeStart, edgeEnd, start) >= -EPSILON
      const endInside = cross(edgeStart, edgeEnd, end) >= -EPSILON
      if (startInside && endInside) output.push(end)
      else if (startInside) output.push(intersection(start, end, edgeStart, edgeEnd))
      else if (endInside) output.push(intersection(start, end, edgeStart, edgeEnd), end)
    }
    output = normalize(output)
  }
  if (signedDoubleArea(output) < 0) output.reverse()
  return output
}

function intersection(
  start: MeshVertex,
  end: MeshVertex,
  edgeStart: FracturePoint2D,
  edgeEnd: FracturePoint2D,
): MeshVertex {
  const segmentX = end.x - start.x, segmentY = end.y - start.y
  const edgeX = edgeEnd.x - edgeStart.x, edgeY = edgeEnd.y - edgeStart.y
  const denominator = segmentX * edgeY - segmentY * edgeX
  if (Math.abs(denominator) <= EPSILON) return { ...end }
  const offsetX = edgeStart.x - start.x, offsetY = edgeStart.y - start.y
  const rawT = (offsetX * edgeY - offsetY * edgeX) / denominator
  const t = Math.max(0, Math.min(1, rawT))
  return {
    x: clean(start.x + (end.x - start.x) * t),
    y: clean(start.y + (end.y - start.y) * t),
    u: start.u + (end.u - start.u) * t,
    v: start.v + (end.v - start.v) * t,
  }
}

function normalize(input: readonly MeshVertex[]): MeshVertex[] {
  const vertices: MeshVertex[] = []
  input.forEach(vertex => {
    if (!vertices.length || !samePoint(vertices.at(-1)!, vertex)) vertices.push({ ...vertex })
  })
  if (vertices.length > 1 && samePoint(vertices[0], vertices.at(-1)!)) vertices.pop()
  let changed = true
  while (changed && vertices.length > 3) {
    changed = false
    for (let index = 0; index < vertices.length; index++) {
      const previous = vertices[(index + vertices.length - 1) % vertices.length]
      const current = vertices[index]
      const next = vertices[(index + 1) % vertices.length]
      if (Math.abs(cross(previous, current, next)) <= EPSILON) {
        vertices.splice(index, 1)
        changed = true
        break
      }
    }
  }
  return vertices
}

function signedDoubleArea(points: readonly FracturePoint2D[]): number {
  let area = 0
  for (let index = 0; index < points.length; index++) {
    const current = points[index], next = points[(index + 1) % points.length]
    area += current.x * next.y - next.x * current.y
  }
  return area
}

function cross(start: FracturePoint2D, end: FracturePoint2D, point: FracturePoint2D): number {
  return (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x)
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
