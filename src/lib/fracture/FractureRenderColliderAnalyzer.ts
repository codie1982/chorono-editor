import type { OverrideMap } from '@/lib/evaluator'
import { evaluateSceneFrame } from '@/lib/runtime/evaluateSceneFrame'
import type { ChronoScene } from '@/lib/types'
import type { FracturePoint2D } from '@/lib/types/fracture'
import {
  FractureOverlayGeometryResolver,
  type FractureOverlayFrame,
  type FractureOverlayPolygon,
} from './FractureOverlayGeometryResolver'

const ALIGNED_TOLERANCE_PX = 0.01
const MAX_DELTA_LINES = 64

export interface FractureRenderColliderDeltaLine {
  readonly layerId: string
  readonly renderPoint: FracturePoint2D
  readonly colliderPoint: FracturePoint2D
  readonly distancePx: number
}

export interface FractureRenderColliderReport {
  readonly status: 'pass' | 'warning'
  readonly recordId: string
  readonly generationId: string
  readonly phase: 'source' | 'fragments'
  readonly eventTimeMs: number
  readonly eventTick: number
  readonly atEvent: boolean
  readonly renderPolygonCount: number
  readonly colliderPolygonCount: number
  readonly maxBoundaryDeltaPx: number
  readonly meanBoundaryDeltaPx: number
  readonly sampleCount: number
  readonly deltaLines: readonly FractureRenderColliderDeltaLine[]
}

export interface FractureRenderColliderUnavailable {
  readonly status: 'unavailable'
  readonly reason: string
}

export type FractureRenderColliderAnalysis = FractureRenderColliderReport
  | FractureRenderColliderUnavailable

/**
 * Compares current visible fracture boundaries with compiled rigid colliders.
 *
 * Both inputs are resolved in composition pixels from the same evaluated frame.
 * The report uses a symmetric vertex-to-boundary distance: render vertices are
 * projected onto collider edges and collider vertices onto render edges. This
 * makes different tessellations comparable without assuming matching vertex
 * indices. Delta lines are bounded and diagnostic-only; no runtime or scene
 * state is retained between calls.
 */
export class FractureRenderColliderAnalyzer {
  constructor(private readonly resolver = new FractureOverlayGeometryResolver()) {}

  /** Analyze an arbitrary evaluated frame without mutating playback or source. */
  analyze(
    scene: ChronoScene,
    recordId: string | null,
    timeMs: number,
    overrides?: OverrideMap,
  ): FractureRenderColliderAnalysis {
    const frame = this.resolver.resolve(scene, recordId, timeMs, overrides)
    return frame ? this.analyzeFrame(frame) : unavailable('The fracture topology or generated output is missing.')
  }

  /** Analyze the exact committed topology event through the canonical evaluator. */
  analyzeCommittedEvent(scene: ChronoScene, recordId: string): FractureRenderColliderAnalysis {
    const record = scene.physics?.rigidBakes.find(candidate => candidate.id === recordId)
    const event = record?.recipe.fractureEvents?.[0]
    if (!record || !event) return unavailable('This bake has no committed fracture event.')
    const eventTimeMs = record.recipe.startTimeMs + event.timeMs
    const overrides = evaluateSceneFrame(scene, eventTimeMs).overrides
    return this.analyze(scene, recordId, eventTimeMs, overrides)
  }

  /** Compare one already-resolved frame, preserving its exact phase metadata. */
  analyzeFrame(frame: FractureOverlayFrame): FractureRenderColliderAnalysis {
    if (!frame.renderPolygons.length) {
      return unavailable('Current fragment appearance is not an explicit straight path or fracture Mesh2D boundary.')
    }
    const colliders = new Map(frame.dynamicColliderPolygons.map(polygon => [layerId(polygon.id), polygon]))
    const samples: FractureRenderColliderDeltaLine[] = []
    for (const render of frame.renderPolygons) {
      const collider = colliders.get(render.id)
      if (!collider) return unavailable(`The active rigid collider is missing for ${render.id}.`)
      samples.push(...polygonDeltas(render, collider))
    }
    if (colliders.size !== frame.renderPolygons.length || !samples.length) {
      return unavailable('Render and collider polygon ownership does not match the active topology.')
    }
    const maxBoundaryDeltaPx = samples.reduce((maximum, sample) => Math.max(maximum, sample.distancePx), 0)
    const meanBoundaryDeltaPx = samples.reduce((sum, sample) => sum + sample.distancePx, 0) / samples.length
    return {
      status: maxBoundaryDeltaPx <= ALIGNED_TOLERANCE_PX ? 'pass' : 'warning',
      recordId: frame.recordId,
      generationId: frame.generationId,
      phase: frame.phase,
      eventTimeMs: frame.eventTimeMs,
      eventTick: frame.eventTick,
      atEvent: frame.atEvent,
      renderPolygonCount: frame.renderPolygons.length,
      colliderPolygonCount: frame.dynamicColliderPolygons.length,
      maxBoundaryDeltaPx,
      meanBoundaryDeltaPx,
      sampleCount: samples.length,
      deltaLines: samples
        .filter(sample => sample.distancePx > ALIGNED_TOLERANCE_PX)
        .sort((left, right) => right.distancePx - left.distancePx)
        .slice(0, MAX_DELTA_LINES),
    }
  }
}

function polygonDeltas(
  render: FractureOverlayPolygon,
  collider: FractureOverlayPolygon,
): FractureRenderColliderDeltaLine[] {
  return [
    ...directedDeltas(render.id, render.points, collider.points, 'render'),
    ...directedDeltas(render.id, collider.points, render.points, 'collider'),
  ]
}

function directedDeltas(
  layerIdValue: string,
  points: readonly FracturePoint2D[],
  target: readonly FracturePoint2D[],
  source: 'render' | 'collider',
): FractureRenderColliderDeltaLine[] {
  return points.map(point => {
    const nearest = nearestBoundaryPoint(point, target)
    return {
      layerId: layerIdValue,
      renderPoint: source === 'render' ? point : nearest,
      colliderPoint: source === 'collider' ? point : nearest,
      distancePx: Math.hypot(point.x - nearest.x, point.y - nearest.y),
    }
  })
}

function nearestBoundaryPoint(point: FracturePoint2D, polygon: readonly FracturePoint2D[]): FracturePoint2D {
  let nearest = polygon[0]
  let minimumSquared = Number.POSITIVE_INFINITY
  for (let index = 0; index < polygon.length; index++) {
    const candidate = projectToSegment(point, polygon[index], polygon[(index + 1) % polygon.length])
    const squared = (candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2
    if (squared < minimumSquared) {
      minimumSquared = squared
      nearest = candidate
    }
  }
  return nearest
}

function projectToSegment(point: FracturePoint2D, start: FracturePoint2D, end: FracturePoint2D): FracturePoint2D {
  const dx = end.x - start.x, dy = end.y - start.y
  const denominator = dx * dx + dy * dy
  if (denominator <= Number.EPSILON) return start
  const amount = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / denominator))
  return { x: start.x + dx * amount, y: start.y + dy * amount }
}

function layerId(colliderId: string): string {
  return colliderId.endsWith(':collider') ? colliderId.slice(0, -':collider'.length) : colliderId
}

function unavailable(reason: string): FractureRenderColliderUnavailable {
  return { status: 'unavailable', reason }
}
