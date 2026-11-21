import {
  Mesh2DBoundaryRingExtractor,
  ShapeBoundaryMesh2DGenerator,
  SplineBoundaryMesh2DGenerator,
  StructuredGridMesh2DGenerator,
  type Mesh2DBoundaryRing,
  type ShapeBoundaryInput,
} from '@/lib/geometry'
import type { Layer } from '@/lib/types'
import type { Mesh2DGeometry } from '@/lib/types/mesh2d'
import type { FractureBounds2D, FracturePoint2D } from '@/lib/types/fracture'
import { ConvexPolygon2D } from './ConvexPolygon2D'

const MIN_TRIANGLE_DOUBLE_AREA = 1e-10

/**
 * Validated source region in layer-local composition pixels.
 *
 * `geometry` is newly generated for image, shape and spline sources. Mesh2D
 * sources expose their existing readonly geometry without copying its dense
 * arrays. Callers must treat every geometry array as borrowed and immutable.
 * Rings are detached immutable records ordered by topology traversal.
 */
export interface FractureSourceRegion {
  readonly sourceKind: 'rectangle' | 'shape' | 'spline' | 'mesh2d'
  readonly geometry: Mesh2DGeometry
  readonly rings: readonly Mesh2DBoundaryRing[]
  readonly centroidPx: FracturePoint2D
  readonly boundsPx: FractureBounds2D
  readonly areaPx2: number
  readonly isSingleConvexRing: boolean
}

/**
 * Converts supported visual layers into validated triangle regions.
 *
 * This compiler preserves concave outlines, holes and disconnected outer
 * regions instead of forcing them through a convex polygon contract. Source
 * generation reuses the canonical Mesh2D adapters, while area and centroid
 * are integrated from validated triangles so holes are subtracted by the
 * actual triangulation. It retains no layer or geometry state between calls.
 */
export class FractureSourceRegionCompiler {
  constructor(
    private readonly shapeGenerator = new ShapeBoundaryMesh2DGenerator(),
    private readonly splineGenerator = new SplineBoundaryMesh2DGenerator(),
    private readonly gridGenerator = new StructuredGridMesh2DGenerator(),
    private readonly ringExtractor = new Mesh2DBoundaryRingExtractor(),
  ) {}

  /** Compile one borrowed layer without mutating or retaining it. */
  compile(layer: Layer): FractureSourceRegion {
    if (layer.type === 'image') {
      const width = layer.size?.width, height = layer.size?.height
      if (!Number.isFinite(width) || !Number.isFinite(height) || width! <= 0 || height! <= 0) {
        throw new Error('Fracture image source requires positive finite size.')
      }
      return this.fromGeometry('rectangle', this.gridGenerator.generate({
        width: width!, height: height!, columns: 1, rows: 1,
      }).geometry)
    }
    if (layer.type === 'shape') {
      if (!layer.size) throw new Error('Fracture shape source requires positive finite size.')
      const input: ShapeBoundaryInput = {
        kind: layer.shapeKind ?? layer.shape ?? 'rect',
        size: layer.size,
        params: layer.shapeParams,
        cornerRadius: layer.style?.cornerRadius,
      }
      if (!this.shapeGenerator.supports(input.kind)) {
        throw new Error(`Shape "${input.kind}" is open or unsupported as a fracture boundary.`)
      }
      return this.fromGeometry('shape', this.shapeGenerator.generate(layer.id, input).geometry)
    }
    if (layer.type === 'spline' && layer.spline) {
      return this.fromGeometry('spline', this.splineGenerator.generate(layer.id, layer.spline).geometry)
    }
    if (layer.type === 'mesh2d' && layer.mesh2d) {
      if (layer.mesh2d.source.kind === 'fractureFragment') {
        throw new Error('Generated fracture fragments require the later secondary-destruction workflow.')
      }
      if (layer.mesh2d.deformation) {
        throw new Error('Fracture Mesh2D source deformation must be baked into static geometry before Preview.')
      }
      return this.fromGeometry('mesh2d', layer.mesh2d.geometry)
    }
    throw new Error('Fracture source must be an image rectangle, closed shape, closed spline or Mesh2D.')
  }

  private fromGeometry(
    sourceKind: FractureSourceRegion['sourceKind'],
    geometry: Mesh2DGeometry,
  ): FractureSourceRegion {
    const rings = this.ringExtractor.extract(geometry)
    const metrics = integrateTriangles(geometry)
    return Object.freeze({
      sourceKind,
      geometry,
      rings,
      ...metrics,
      isSingleConvexRing: isSingleConvexRing(rings),
    })
  }
}

/**
 * Integrates area and centroid from positive-winding Mesh2D triangles.
 * Positions use local composition pixels. Degenerate or reversed triangles
 * fail explicitly even if a future validator accidentally admits them.
 */
function integrateTriangles(geometry: Mesh2DGeometry): Pick<
  FractureSourceRegion, 'areaPx2' | 'centroidPx' | 'boundsPx'
> {
  const { positions } = geometry
  const indices = geometry.topology.triangleIndices
  let doubleAreaSum = 0
  let weightedX = 0
  let weightedY = 0
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let offset = 0; offset < positions.length; offset += 2) {
    const x = positions[offset], y = positions[offset + 1]
    minX = Math.min(minX, x); minY = Math.min(minY, y)
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
  }
  for (let offset = 0; offset < indices.length; offset += 3) {
    const a = indices[offset] * 2, b = indices[offset + 1] * 2, c = indices[offset + 2] * 2
    const ax = positions[a], ay = positions[a + 1]
    const bx = positions[b], by = positions[b + 1]
    const cx = positions[c], cy = positions[c + 1]
    const doubleArea = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
    if (doubleArea <= MIN_TRIANGLE_DOUBLE_AREA) {
      throw new Error('Fracture source region contains a degenerate or reversed triangle.')
    }
    doubleAreaSum += doubleArea
    weightedX += (ax + bx + cx) * doubleArea
    weightedY += (ay + by + cy) * doubleArea
  }
  if (doubleAreaSum <= MIN_TRIANGLE_DOUBLE_AREA) throw new Error('Fracture source region has no positive area.')
  return {
    areaPx2: doubleAreaSum / 2,
    centroidPx: Object.freeze({
      x: weightedX / (3 * doubleAreaSum),
      y: weightedY / (3 * doubleAreaSum),
    }),
    boundsPx: Object.freeze({ minX, minY, maxX, maxY }),
  }
}

function isSingleConvexRing(rings: readonly Mesh2DBoundaryRing[]): boolean {
  if (rings.length !== 1 || rings[0].role !== 'outer') return false
  try {
    new ConvexPolygon2D(rings[0].points, 'Fracture source region')
    return true
  } catch {
    return false
  }
}
