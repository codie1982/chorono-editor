import type { OverrideMap } from '@/lib/evaluator'
import { createLayerWorldMatrixResolver } from '@/lib/geometry/resolveLayerWorldMatrix'
import type { ChronoScene, Layer } from '@/lib/types'
import type { FracturePoint2D } from '@/lib/types/fracture'
import type { RigidBakeRecord, RigidBodySnapshot } from '@/lib/types/physics'

export interface FractureOverlayPolygon {
  readonly id: string
  readonly points: readonly FracturePoint2D[]
  readonly centroid: FracturePoint2D
  /** Convex fan indices used only by the editor diagnostic overlay. */
  readonly triangleIndices: readonly number[]
}

export interface FractureOverlayFrame {
  readonly recordId: string
  readonly generationId: string
  readonly phase: 'source' | 'fragments'
  readonly eventTimeMs: number
  readonly fragments: readonly FractureOverlayPolygon[]
  readonly colliderPolygons: readonly FractureOverlayPolygon[]
}

/**
 * Prepares renderer-independent world-space geometry for fracture diagnostics.
 *
 * Source-local Voronoi polygons use the source layer transform before the
 * topology event and each generated fragment layer transform afterwards. The
 * same evaluated override map as Canvas is consumed, so animated x/y/rotation,
 * parent transforms and authored scale stay aligned with the visible pixels.
 * The convex fan is deterministic and diagnostic only; it does not claim to
 * be the future appearance/UV fragment mesh contract. Missing legacy output
 * returns `null` rather than drawing an approximate or misleading overlay.
 */
export class FractureOverlayGeometryResolver {
  resolve(
    scene: ChronoScene,
    recordId: string | null,
    timeMs: number,
    overrides?: OverrideMap,
  ): FractureOverlayFrame | null {
    const record = resolveRecord(scene, recordId)
    const event = record?.recipe.fractureEvents?.[0]
    const generationId = record?.fractureGeneration?.generationId
    if (!record || !event || !generationId) return null
    const generation = scene.physics?.fractureGenerations?.find(item => item.generationId === generationId)
    const sourceLayer = scene.layers.find(layer => layer.id === generation?.source.ownerId)
    if (!generation || !sourceLayer) return null

    const eventTimeMs = record.recipe.startTimeMs + event.timeMs
    const phase = timeMs < eventTimeMs ? 'source' : 'fragments'
    const layerById = new Map(scene.layers.map(layer => [layer.id, layer]))
    const resolveMatrix = createLayerWorldMatrixResolver(scene, timeMs, overrides)
    const bodyByLayer = new Map(record.recipe.bodies.map(body => [body.layerId, body]))
    const fragments: FractureOverlayPolygon[] = []

    for (const fragment of generation.fragments) {
      const layer = phase === 'source' ? sourceLayer : layerById.get(fragment.id)
      if (!layer) return null
      const matrix = resolveMatrix(layer)
      fragments.push({
        id: fragment.id,
        points: fragment.polygon.map(point => matrix.applyToPoint(point)),
        centroid: matrix.applyToPoint(fragment.centroidPx),
        triangleIndices: convexFan(fragment.polygon.length),
      })
    }

    const colliderPolygons = phase === 'source'
      ? [polygonFromPoints('source-collider', generation.source.polygon, sourceLayer, resolveMatrix)]
      : fragments.map(fragment => ({ ...fragment, id: `${fragment.id}:collider` }))
    for (const body of record.recipe.bodies) {
      if (body.motionType !== 'static') continue
      const layer = layerById.get(body.layerId)
      const polygon = layer && rectangleCollider(body, layer, resolveMatrix)
      if (polygon) colliderPolygons.push(polygon)
    }

    return {
      recordId: record.id,
      generationId,
      phase,
      eventTimeMs,
      fragments,
      colliderPolygons,
    }
  }
}

/** Select the requested fracture record or the newest renderable one. */
function resolveRecord(scene: ChronoScene, recordId: string | null): RigidBakeRecord | undefined {
  const records = scene.physics?.rigidBakes ?? []
  const requested = recordId ? records.find(record => record.id === recordId) : undefined
  if (requested?.recipe.fractureEvents?.length && requested.fractureGeneration) return requested
  return [...records].reverse().find(record => record.recipe.fractureEvents?.length && record.fractureGeneration)
}

/** Build a stable 0,i,i+1 fan for one validated convex polygon. */
function convexFan(vertexCount: number): number[] {
  const indices: number[] = []
  for (let index = 1; index < vertexCount - 1; index++) indices.push(0, index, index + 1)
  return indices
}

/** Transform one source-local polygon through the exact Canvas world matrix. */
function polygonFromPoints(
  id: string,
  points: readonly FracturePoint2D[],
  layer: Layer,
  resolveMatrix: ReturnType<typeof createLayerWorldMatrixResolver>,
): FractureOverlayPolygon {
  const matrix = resolveMatrix(layer)
  const transformed = points.map(point => matrix.applyToPoint(point))
  const centroid = transformed.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 })
  return {
    id,
    points: transformed,
    centroid: { x: centroid.x / transformed.length, y: centroid.y / transformed.length },
    triangleIndices: convexFan(points.length),
  }
}

/** Resolve the current first-slice rectangle collider without approximation. */
function rectangleCollider(
  body: RigidBodySnapshot,
  layer: Layer,
  resolveMatrix: ReturnType<typeof createLayerWorldMatrixResolver>,
): FractureOverlayPolygon | null {
  if (body.collider !== 'rectangle' || !layer.size) return null
  return polygonFromPoints(`${body.layerId}:collider`, [
    { x: 0, y: 0 },
    { x: layer.size.width, y: 0 },
    { x: layer.size.width, y: layer.size.height },
    { x: 0, y: layer.size.height },
  ], layer, resolveMatrix)
}
