import earcut, { deviation } from 'earcut'
import type { Mesh2DData, Mesh2DGeometry, Mesh2DTopology } from '@/lib/types/mesh2d'
import type { SplinePathData } from '@/lib/types/spline'
import { hashMesh2DCanonical, Mesh2DTopologyHasher } from './Mesh2DTopologyHasher'
import { Mesh2DTopologyValidator } from './Mesh2DTopologyValidator'
import { SplineBoundaryRingBuilder, type SplineBoundaryRing } from './SplineBoundaryRings'

export interface SplineBoundaryMesh2DOptions {
  /** Maximum chord-deviation tolerance in source-layer local pixels. Authored
   * Object interpolation can request finer sampling, never a weaker bound. */
  readonly flattenTolerance?: number
}

/**
 * Converts validated closed spline boundaries into a fixed-topology Mesh2D.
 *
 * The source spline is borrowed and never mutated. Contours are flattened in
 * source-local pixels, classified as outer/hole rings and triangulated with
 * Earcut 3.2.4. Each Earcut result is area-checked, reoriented to Chorono's
 * positive x-right/y-down triangle convention and passed through the shared
 * topology validator. UVs fit the aggregate local bounds. No viewport, React,
 * renderer or GPU state is retained by instances.
 */
export class SplineBoundaryMesh2DGenerator {
  static readonly generatorVersion = 1
  static readonly triangulationVersion = '3.2.4' as const
  static readonly defaultFlattenTolerance = 0.25

  constructor(
    private readonly ringBuilder = new SplineBoundaryRingBuilder(),
    private readonly hasher = new Mesh2DTopologyHasher(),
    private readonly validator = new Mesh2DTopologyValidator(),
  ) {}

  /** Generates a portable Mesh2D recipe and derived geometry. */
  generate(sourceLayerId: string, spline: SplinePathData, options: SplineBoundaryMesh2DOptions = {}): Mesh2DData {
    if (!sourceLayerId) throw new Error('Spline-boundary Mesh2D requires a source layer id')
    const flattenTolerance = options.flattenTolerance ?? SplineBoundaryMesh2DGenerator.defaultFlattenTolerance
    const rings = this.ringBuilder.build(spline, flattenTolerance)
    const sourceFingerprint = this.fingerprintFromRings(rings, spline.fillRule, flattenTolerance)
    const geometry = this.triangulate(rings)
    return {
      schemaVersion: 1,
      source: {
        kind: 'splineBoundary',
        sourceLayerId,
        sourceFingerprint,
        flattenTolerance,
        uvFit: 'bounds',
        triangulation: {
          algorithm: 'earcut',
          algorithmVersion: SplineBoundaryMesh2DGenerator.triangulationVersion,
        },
        generatorVersion: SplineBoundaryMesh2DGenerator.generatorVersion,
      },
      geometry,
    }
  }

  /** Computes the deterministic flattened-source identity without triangulating. */
  fingerprint(spline: SplinePathData, options: SplineBoundaryMesh2DOptions = {}): string {
    const flattenTolerance = options.flattenTolerance ?? SplineBoundaryMesh2DGenerator.defaultFlattenTolerance
    const rings = this.ringBuilder.build(spline, flattenTolerance)
    return this.fingerprintFromRings(rings, spline.fillRule, flattenTolerance)
  }

  /**
   * Reports whether persisted derived geometry still matches its source spline.
   * Invalid/missing source geometry is stale rather than an exception so an
   * inspector can render a recoverable warning.
   */
  isCurrent(data: Mesh2DData, spline: SplinePathData): boolean {
    if (data.source.kind !== 'splineBoundary') return false
    try {
      return data.source.sourceFingerprint === this.fingerprint(spline, {
        flattenTolerance: data.source.flattenTolerance,
      })
    } catch {
      return false
    }
  }

  private fingerprintFromRings(
    rings: readonly SplineBoundaryRing[],
    fillRule: SplinePathData['fillRule'],
    flattenTolerance: number,
  ): string {
    const records = [
      `generator:${SplineBoundaryMesh2DGenerator.generatorVersion}`,
      `triangulator:earcut@${SplineBoundaryMesh2DGenerator.triangulationVersion}`,
      `fill:${fillRule}`,
      `tolerance:${canonicalNumber(flattenTolerance)}`,
      `rings:${rings.length}`,
    ]
    for (const ring of rings) {
      records.push(
        `contour:${ring.contourId}`,
        `role:${ring.role}`,
        `parent:${ring.parentIndex ?? 'none'}`,
        `points:${ring.points.length}`,
      )
      ring.points.forEach(point => records.push(
        `${point.sampleIndex}:${canonicalNumber(point.x)},${canonicalNumber(point.y)}`,
      ))
    }
    return hashMesh2DCanonical('mesh2d-spline-boundary-v1', records)
  }

  private triangulate(rings: readonly SplineBoundaryRing[]): Mesh2DGeometry {
    const positions: number[] = []
    const vertexIds: string[] = []
    const triangleIndices: number[] = []
    const outerIndices = rings.map((ring, index) => ({ ring, index }))
      .filter(item => item.ring.role === 'outer')

    for (const outer of outerIndices) {
      const group = [outer.ring, ...rings.filter(ring => ring.role === 'hole' && ring.parentIndex === outer.index)]
      const coordinates: number[] = []
      const holeIndices: number[] = []
      const localToGlobal: number[] = []
      group.forEach((ring, groupIndex) => {
        if (groupIndex > 0) holeIndices.push(coordinates.length / 2)
        ring.points.forEach(point => {
          localToGlobal.push(positions.length / 2)
          coordinates.push(point.x, point.y)
          positions.push(point.x, point.y)
          vertexIds.push(`spline:${ring.contourId}:${point.sampleIndex}`)
        })
      })

      const localTriangles = earcut(coordinates, holeIndices, 2)
      if (localTriangles.length === 0 || localTriangles.length % 3 !== 0) {
        throw new Error(`Earcut could not triangulate spline contour "${outer.ring.contourId}"`)
      }
      const areaDeviation = deviation(coordinates, holeIndices, 2, localTriangles)
      if (!Number.isFinite(areaDeviation) || areaDeviation > 1e-8) {
        throw new Error(`Spline triangulation area mismatch for contour "${outer.ring.contourId}"`)
      }
      for (let offset = 0; offset < localTriangles.length; offset += 3) {
        let a = localToGlobal[localTriangles[offset]]
        let b = localToGlobal[localTriangles[offset + 1]]
        let c = localToGlobal[localTriangles[offset + 2]]
        if (signedDoubleTriangleArea(positions, a, b, c) < 0) [b, c] = [c, b]
        triangleIndices.push(a, b, c)
      }
    }

    const bounds = positionBounds(positions)
    const uvs: number[] = []
    for (let index = 0; index < positions.length; index += 2) {
      uvs.push(
        (positions[index] - bounds.minX) / bounds.width,
        (positions[index + 1] - bounds.minY) / bounds.height,
      )
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
    const geometry = { positions, uvs, topology }
    const validation = this.validator.validate(geometry)
    if (!validation.valid || validation.diagnostics.length > 0) {
      throw new Error(`Spline boundary generated invalid Mesh2D topology: ${validation.diagnostics.map(item => item.code).join(', ')}`)
    }
    return geometry
  }
}

function canonicalNumber(value: number): string {
  return Object.is(value, -0) ? '0' : String(value)
}

function signedDoubleTriangleArea(positions: readonly number[], a: number, b: number, c: number): number {
  const ax = positions[a * 2], ay = positions[a * 2 + 1]
  const bx = positions[b * 2], by = positions[b * 2 + 1]
  const cx = positions[c * 2], cy = positions[c * 2 + 1]
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
}

function positionBounds(positions: readonly number[]): { minX: number; minY: number; width: number; height: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let index = 0; index < positions.length; index += 2) {
    minX = Math.min(minX, positions[index]); minY = Math.min(minY, positions[index + 1])
    maxX = Math.max(maxX, positions[index]); maxY = Math.max(maxY, positions[index + 1])
  }
  const width = maxX - minX, height = maxY - minY
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Spline boundary must have finite non-zero width and height')
  }
  return { minX, minY, width, height }
}
