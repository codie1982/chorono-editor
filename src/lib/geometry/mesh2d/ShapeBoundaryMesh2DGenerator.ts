import type { Size } from '@/lib/geometry/ShapeToPathConverter'
import type { ShapeKind, ShapeParams } from '@/lib/types'
import type { SplinePathData } from '@/lib/types/spline'
import { ShapeToSplineConverter } from '../conversion/ShapeToSplineConverter'
import type { Mesh2DData, Mesh2DGeometry, Mesh2DTopology } from '@/lib/types/mesh2d'
import { Mesh2DTopologyHasher } from './Mesh2DTopologyHasher'
import { SplineBoundaryMesh2DGenerator, type SplineBoundaryMesh2DOptions } from './SplineBoundaryMesh2DGenerator'

export type Mesh2DShapeKind = ShapeKind | 'circle'

export interface ShapeBoundaryInput {
  readonly kind: Mesh2DShapeKind
  readonly size: Size
  readonly params?: ShapeParams
  readonly cornerRadius?: number
}

/**
 * Adapts closed parametric 2D shapes to the validated boundary mesh pipeline.
 *
 * Shape geometry is read from `ShapeToPathConverter`, then converted into a
 * deterministic, in-memory spline boundary. The source shape is borrowed and
 * never mutated. Open primitives are rejected because this subsystem creates
 * filled surfaces, not stroke ribbons. Full rings are split into an outer
 * contour and a real even-odd hole before validation. No intermediate spline
 * is persisted in scene JSON.
 */
export class ShapeBoundaryMesh2DGenerator {
  static readonly supportedKinds: readonly Mesh2DShapeKind[] = [
    'rect', 'circle', 'ellipse', 'capsule', 'polygon', 'star', 'ring', 'blob',
  ]

  constructor(
    private readonly splineGenerator = new SplineBoundaryMesh2DGenerator(),
    private readonly hasher = new Mesh2DTopologyHasher(),
  ) {}

  /** Returns whether a shape kind has a closed filled-surface adapter. */
  supports(kind: Mesh2DShapeKind): boolean {
    return ShapeBoundaryMesh2DGenerator.supportedKinds.includes(kind)
  }

  /** Generates portable shape-linked Mesh2D data in source-local pixels. */
  generate(
    sourceLayerId: string,
    input: ShapeBoundaryInput,
    options: SplineBoundaryMesh2DOptions = {},
  ): Mesh2DData {
    if (!sourceLayerId) throw new Error('Shape-boundary Mesh2D requires a source layer id')
    const spline = this.toBoundarySpline(input)
    const generated = this.splineGenerator.generate(sourceLayerId, spline, options)
    if (generated.source.kind !== 'splineBoundary') throw new Error('Unexpected boundary generator source')
    return {
      ...generated,
      source: { ...generated.source, kind: 'shapeBoundary' },
      geometry: this.renameVertexOwnership(generated.geometry),
    }
  }

  /** Computes the same deterministic source identity used by `generate`. */
  fingerprint(input: ShapeBoundaryInput, options: SplineBoundaryMesh2DOptions = {}): string {
    return this.splineGenerator.fingerprint(this.toBoundarySpline(input), options)
  }

  /** Returns false for another recipe kind or invalid/changed shape geometry. */
  isCurrent(data: Mesh2DData, input: ShapeBoundaryInput): boolean {
    if (data.source.kind !== 'shapeBoundary') return false
    try {
      return data.source.sourceFingerprint === this.fingerprint(input, {
        flattenTolerance: data.source.flattenTolerance,
      })
    } catch {
      return false
    }
  }

  /** Reuse the shared exact shape walker while preserving this adapter's
   * historical closed-kind admission and deterministic local record IDs. */
  private toBoundarySpline(input: ShapeBoundaryInput): SplinePathData {
    if (!this.supports(input.kind)) {
      throw new Error(`Shape "${input.kind}" is open or unsupported as a Mesh2D boundary`)
    }
    const spline = new ShapeToSplineConverter().convert(input)
    if (Object.values(spline.contours).some(contour => !contour.closed)) throw new Error('Shape must be closed before triangulation')
    return spline
  }

  private renameVertexOwnership(geometry: Mesh2DGeometry): Mesh2DGeometry {
    const topologyWithoutHash: Omit<Mesh2DTopology, 'topologyHash'> = {
      ...geometry.topology,
      vertexIds: geometry.topology.vertexIds.map(id => id.replace(/^spline:/, 'shape:')),
    }
    return {
      ...geometry,
      topology: { ...topologyWithoutHash, topologyHash: this.hasher.hash(topologyWithoutHash) },
    }
  }
}
