import {
  Mesh2DAdjacencyBuilder,
  Mesh2DTopologyValidator,
  ShapeBoundaryMesh2DGenerator,
  SplineBoundaryMesh2DGenerator,
  type ShapeBoundaryInput,
} from '@/lib/geometry'
import type { Layer } from '@/lib/types'
import type { Mesh2DGeometry } from '@/lib/types/mesh2d'
import type { FractureBounds2D, FracturePoint2D } from '@/lib/types/fracture'
import { ConvexPolygon2D } from './ConvexPolygon2D'

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
 * Shape and spline geometry is compiled through the existing Mesh2D boundary
 * generators, so curve flattening, contour validation and source-local units
 * remain authoritative in one place. This first slice then extracts one
 * boundary loop and requires strict convexity. Convex Mesh2D sources reuse
 * their validated portable topology. Multiple rings, holes and concave
 * outlines fail explicitly for the later variable-topology clipping slice.
 * Instances are stateless and retain no source arrays.
 */
export class FractureSourceBoundaryCompiler {
  constructor(
    private readonly shapeGenerator = new ShapeBoundaryMesh2DGenerator(),
    private readonly splineGenerator = new SplineBoundaryMesh2DGenerator(),
    private readonly adjacencyBuilder = new Mesh2DAdjacencyBuilder(),
    private readonly topologyValidator = new Mesh2DTopologyValidator(),
  ) {}

  /** Compile one borrowed layer without mutating or retaining it. */
  compile(layer: Layer): FractureSourceBoundary {
    if (layer.type === 'image') return this.rectangle(layer)
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
      const validation = this.topologyValidator.validate(layer.mesh2d.geometry)
      if (!validation.valid) {
        const codes = validation.diagnostics.filter(item => item.severity === 'error').map(item => item.code)
        throw new Error(`Fracture Mesh2D source topology is invalid: ${codes.join(', ')}`)
      }
      return this.fromGeometry('mesh2d', layer.mesh2d.geometry)
    }
    throw new Error('Fracture source must be an image rectangle, closed shape, closed spline or convex Mesh2D.')
  }

  private rectangle(layer: Layer): FractureSourceBoundary {
    const width = layer.size?.width, height = layer.size?.height
    if (!Number.isFinite(width) || !Number.isFinite(height) || width! <= 0 || height! <= 0) {
      throw new Error('Fracture image source requires positive finite size.')
    }
    return this.validated('rectangle', [
      { x: 0, y: 0 }, { x: width!, y: 0 },
      { x: width!, y: height! }, { x: 0, y: height! },
    ])
  }

  private fromGeometry(sourceKind: 'shape' | 'spline' | 'mesh2d', geometry: Mesh2DGeometry): FractureSourceBoundary {
    const polygon = extractSingleBoundaryLoop(geometry, this.adjacencyBuilder)
    try {
      return this.validated(sourceKind, polygon)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Fracture ${sourceKind} source must be one hole-free convex boundary. ${detail}`)
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

function extractSingleBoundaryLoop(
  geometry: Mesh2DGeometry,
  adjacencyBuilder: Mesh2DAdjacencyBuilder,
): FracturePoint2D[] {
  const boundaryEdges = adjacencyBuilder.build(geometry.topology).boundaryEdges
  if (boundaryEdges.length < 3) throw new Error('Derived geometry has no closed boundary.')
  const neighbors = new Map<number, number[]>()
  boundaryEdges.forEach(edge => {
    const [a, b] = edge.vertices
    neighbors.set(a, [...(neighbors.get(a) ?? []), b])
    neighbors.set(b, [...(neighbors.get(b) ?? []), a])
  })
  if (Array.from(neighbors.values()).some(items => items.length !== 2)) {
    throw new Error('Derived boundary is open or branches.')
  }
  const start = Math.min(...Array.from(neighbors.keys()))
  const loop = [start]
  let previous = -1
  let current = start
  while (loop.length <= boundaryEdges.length) {
    const options = neighbors.get(current)!.filter(index => index !== previous).sort((a, b) => a - b)
    const next = options[0]
    if (next === start) break
    if (next === undefined || loop.includes(next)) throw new Error('Derived boundary contains multiple loops.')
    loop.push(next)
    previous = current
    current = next
  }
  if (loop.length !== boundaryEdges.length) throw new Error('Derived geometry contains a hole or disconnected boundary.')
  return loop.map(index => ({ x: geometry.positions[index * 2], y: geometry.positions[index * 2 + 1] }))
}

function isOriginRectangle(points: readonly FracturePoint2D[], bounds: FractureBounds2D): boolean {
  if (points.length !== 4 || Math.abs(bounds.minX) > 1e-7 || Math.abs(bounds.minY) > 1e-7) return false
  const expected = new Set([
    `0,0`, `${bounds.maxX},0`, `${bounds.maxX},${bounds.maxY}`, `0,${bounds.maxY}`,
  ])
  return points.every(point => expected.has(`${point.x},${point.y}`))
}
