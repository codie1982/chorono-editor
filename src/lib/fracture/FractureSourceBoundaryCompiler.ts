import type { Layer } from '@/lib/types'
import type { FractureBounds2D, FracturePoint2D } from '@/lib/types/fracture'
import { ConvexPolygon2D } from './ConvexPolygon2D'
import { FractureSourceRegionCompiler } from './FractureSourceRegionCompiler'

/** Validated single-ring source geometry in layer-local composition pixels. */
export interface FractureSourceBoundary {
  readonly sourceKind: 'rectangle' | 'shape' | 'spline' | 'mesh2d'
  readonly polygon: readonly FracturePoint2D[]
  readonly centroidPx: FracturePoint2D
  readonly boundsPx: FractureBounds2D
  readonly areaPx2: number
  /** Rectangle keeps the historical adapter; Mesh2D always uses its boundary. */
  readonly colliderKind: 'rectangle' | 'convexPolygon'
  /** True only for the historical 0,0 → width,height rectangle contract. */
  readonly isOriginRectangle: boolean
}

/**
 * Adapts supported visual layers to the convex boundary required by FRACTURE1.
 *
 * Source adaptation, topology validation and region metrics are delegated to
 * `FractureSourceRegionCompiler`. This FRACTURE1 compatibility view then
 * requires one hole-free convex ring. Instances are stateless and retain no
 * source arrays.
 */
export class FractureSourceBoundaryCompiler {
  constructor(private readonly regionCompiler = new FractureSourceRegionCompiler()) {}

  /** Compile one borrowed layer without mutating or retaining it. */
  compile(layer: Layer): FractureSourceBoundary {
    try {
      const region = this.regionCompiler.compile(layer)
      if (!region.isSingleConvexRing) {
        throw new Error('Derived geometry contains a hole or disconnected boundary.')
      }
      return this.validated(region.sourceKind, region.rings[0].points)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Fracture source must be one hole-free convex boundary. ${detail}`)
    }
  }

  private validated(
    sourceKind: FractureSourceBoundary['sourceKind'],
    points: readonly FracturePoint2D[],
  ): FractureSourceBoundary {
    const polygon = new ConvexPolygon2D(points, `Fracture ${sourceKind} boundary`)
    const isRectangle = isOriginRectangle(polygon.points, polygon.bounds)
    return Object.freeze({
      sourceKind,
      polygon: polygon.points,
      centroidPx: polygon.centroid,
      boundsPx: polygon.bounds,
      areaPx2: polygon.area,
      colliderKind: sourceKind !== 'mesh2d' && isRectangle ? 'rectangle' : 'convexPolygon',
      isOriginRectangle: isRectangle,
    })
  }
}

/** Cheap picker admission; the compiler remains the source of detailed errors. */
export function isFractureSourceLayerCandidate(layer: Layer): boolean {
  return ['shape', 'image', 'spline', 'mesh2d'].includes(layer.type)
    && layer.mesh2d?.source.kind !== 'fractureFragment'
    && !layer.parentId && !layer.instanceOf
    && Number.isFinite(layer.transform.scaleX) && layer.transform.scaleX > 0
    && Number.isFinite(layer.transform.scaleY)
    && Math.abs(layer.transform.scaleX - layer.transform.scaleY) <= 1e-9
}

function isOriginRectangle(points: readonly FracturePoint2D[], bounds: FractureBounds2D): boolean {
  if (points.length !== 4 || Math.abs(bounds.minX) > 1e-7 || Math.abs(bounds.minY) > 1e-7) return false
  const expected = new Set([
    `0,0`, `${bounds.maxX},0`, `${bounds.maxX},${bounds.maxY}`, `0,${bounds.maxY}`,
  ])
  return points.every(point => expected.has(`${point.x},${point.y}`))
}
