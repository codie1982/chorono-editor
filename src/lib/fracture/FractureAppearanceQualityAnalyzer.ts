import { createLayerWorldMatrixResolver } from '@/lib/geometry/resolveLayerWorldMatrix'
import { evaluateSceneFrame } from '@/lib/runtime/evaluateSceneFrame'
import type { ChronoScene } from '@/lib/types'
import type { FracturePoint2D } from '@/lib/types/fracture'

const EDGE_QUANTIZATION = 1_000_000
const EVENT_ALIGNMENT_TOLERANCE_PX = 0.01
const AREA_DELTA_TOLERANCE_PERCENT = 0.001

export interface FractureAppearanceQualityReport {
  readonly status: 'pass' | 'warning'
  readonly recordId: string
  readonly generationId: string
  readonly appearanceKind: 'solid' | 'image' | 'mesh2d'
  readonly eventTimeMs: number
  readonly fragmentCount: number
  readonly triangleCount: number
  readonly sharedEdgeCount: number
  readonly sharedBoundaryLengthPx: number
  readonly maxEventAlignmentGapPx: number
  readonly meanEventAlignmentGapPx: number
  readonly eventAreaDeltaPercent: number
  /** Number of generated fragments edited to use the generic mask pipeline. */
  readonly maskedFragmentCount: number
  /** Estimated current peak; zero is exact for the generated mask-free path. */
  readonly estimatedCurrentMaskScratchPeakBytes: number
  /** Four simultaneous RGBA8 surfaces in the current full-frame mask pipeline. */
  readonly fullFrameMaskAlternativePeakBytes: number
}

export interface FractureAppearanceQualityUnavailable {
  readonly status: 'unavailable'
  readonly reason: string
}

export type FractureAppearanceQualityAnalysis = FractureAppearanceQualityReport
  | FractureAppearanceQualityUnavailable

/**
 * Measures one committed fracture's event-frame geometry and mask budget.
 *
 * The analyzer uses the canonical authored frame evaluator at the exact
 * topology event. Every generated vertex is compared with the same source-local
 * point transformed by the source layer, so physical separation after the
 * event is not mislabeled as a raster seam. Area and shared-edge lengths are in
 * composition pixels. The mask estimate mirrors `LayerSurfacePipeline`'s
 * full-frame peak of source, final, content and silhouette RGBA8 surfaces;
 * renderer/GPU/decoded-image memory is deliberately outside this figure.
 * Instances retain no scene or frame state.
 */
export class FractureAppearanceQualityAnalyzer {
  /**
   * Analyze one committed fracture without mutating or retaining the scene.
   *
   * The returned distances use composition pixels at the exact topology event.
   * A missing source, generation or fragment returns a recoverable unavailable
   * result instead of an incomplete numeric report.
   */
  analyze(scene: ChronoScene, recordId: string): FractureAppearanceQualityAnalysis {
    const record = scene.physics?.rigidBakes?.find(candidate => candidate.id === recordId)
    const event = record?.recipe.fractureEvents?.[0]
    const generationId = record?.fractureGeneration?.generationId
    if (!record || !event || !generationId) return unavailable('This record has no fracture event or generation reference.')
    const generation = scene.physics?.fractureGenerations?.find(candidate => candidate.generationId === generationId)
    if (!generation) return unavailable('The fracture generation manifest is missing.')
    const source = scene.layers.find(layer => layer.id === generation.source.ownerId)
    if (!source) return unavailable('The fracture source layer is missing.')
    const fragments = generation.schemaVersion === 1
      ? generation.fragments.map(fragment => ({
        id: fragment.id,
        points: fragment.polygon,
        colliderParts: [fragment.polygon] as readonly (readonly FracturePoint2D[])[],
        fallbackTriangleCount: Math.max(0, fragment.polygon.length - 2),
        layer: scene.layers.find(layer => layer.id === fragment.id),
      }))
      : generation.fragments.map(fragment => ({
        id: fragment.id,
        points: meshPoints(fragment.geometry.positions),
        colliderParts: fragment.colliderParts,
        fallbackTriangleCount: 0,
        layer: scene.layers.find(layer => layer.id === fragment.id),
      }))
    if (fragments.some(fragment => !fragment.layer)) return unavailable('One or more generated fragment layers are missing.')

    const eventTimeMs = record.recipe.startTimeMs + event.timeMs
    const overrides = evaluateSceneFrame(scene, eventTimeMs).overrides
    const resolveMatrix = createLayerWorldMatrixResolver(scene, eventTimeMs, overrides)
    const sourceMatrix = resolveMatrix(source)
    let gapTotal = 0
    let gapCount = 0
    let maxEventAlignmentGapPx = 0
    let fragmentAreaPx2 = 0
    let triangleCount = 0
    let maskedFragmentCount = 0

    for (const fragment of fragments) {
      const { layer: maybeLayer } = fragment
      const layer = maybeLayer!
      const matrix = resolveMatrix(layer)
      for (const point of fragment.points) {
        const expected = sourceMatrix.applyToPoint(point)
        const actual = matrix.applyToPoint(point)
        const gap = Math.hypot(actual.x - expected.x, actual.y - expected.y)
        gapTotal += gap
        gapCount++
        maxEventAlignmentGapPx = Math.max(maxEventAlignmentGapPx, gap)
      }
      fragmentAreaPx2 += fragment.colliderParts.reduce((sum, part) => (
        sum + polygonArea(part.map(point => matrix.applyToPoint(point)))
      ), 0)
      triangleCount += layer.type === 'mesh2d'
        ? (layer.mesh2d?.geometry.topology.triangleIndices.length ?? 0) / 3
        : fragment.fallbackTriangleCount
      if (layer.masks?.length) maskedFragmentCount++
    }

    const sourceAreaPx2 = generation.schemaVersion === 1
      ? polygonArea(generation.source.polygon.map(point => sourceMatrix.applyToPoint(point)))
      : Math.abs(generation.source.rings.reduce((sum, ring) => (
        sum + signedPolygonArea(ring.points.map(point => sourceMatrix.applyToPoint(point)))
      ), 0))
    const eventAreaDeltaPercent = sourceAreaPx2 > 0
      ? Math.abs(fragmentAreaPx2 - sourceAreaPx2) / sourceAreaPx2 * 100
      : Number.POSITIVE_INFINITY
    const sharedEdgeCount = generation.schemaVersion === 1
      ? sharedEdges(generation.fragments.map(fragment => fragment.polygon)).length
      : generation.adjacency.length
    const sharedBoundaryLengthPx = generation.schemaVersion === 1
      ? sharedEdges(generation.fragments.map(fragment => fragment.polygon)).reduce((sum, edge) => {
        const start = sourceMatrix.applyToPoint(edge.start)
        const end = sourceMatrix.applyToPoint(edge.end)
        return sum + Math.hypot(end.x - start.x, end.y - start.y)
      }, 0)
      : generation.adjacency.reduce((sum, edge) => sum + edge.sharedLengthPx * matrixUnitScale(sourceMatrix), 0)
    const fullFrameMaskAlternativePeakBytes = scene.composition.width * scene.composition.height * 4 * 4
    const meanEventAlignmentGapPx = gapCount ? gapTotal / gapCount : Number.POSITIVE_INFINITY
    const status = maxEventAlignmentGapPx <= EVENT_ALIGNMENT_TOLERANCE_PX
      && eventAreaDeltaPercent <= AREA_DELTA_TOLERANCE_PERCENT ? 'pass' : 'warning'

    return {
      status,
      recordId: record.id,
      generationId,
      appearanceKind: record.recipe.fractureAppearance?.kind ?? 'solid',
      eventTimeMs,
      fragmentCount: fragments.length,
      triangleCount,
      sharedEdgeCount,
      sharedBoundaryLengthPx,
      maxEventAlignmentGapPx,
      meanEventAlignmentGapPx,
      eventAreaDeltaPercent,
      maskedFragmentCount,
      estimatedCurrentMaskScratchPeakBytes: maskedFragmentCount ? fullFrameMaskAlternativePeakBytes : 0,
      fullFrameMaskAlternativePeakBytes,
    }
  }
}

function unavailable(reason: string): FractureAppearanceQualityUnavailable {
  return { status: 'unavailable', reason }
}

/** Absolute shoelace area; degenerate polygons report zero. */
function polygonArea(points: readonly FracturePoint2D[]): number {
  return Math.abs(signedPolygonArea(points))
}

function signedPolygonArea(points: readonly FracturePoint2D[]): number {
  let twiceArea = 0
  for (let index = 0; index < points.length; index++) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    twiceArea += current.x * next.y - next.x * current.y
  }
  return twiceArea / 2
}

function meshPoints(positions: readonly number[]): FracturePoint2D[] {
  return Array.from({ length: positions.length / 2 }, (_, index) => ({
    x: positions[index * 2], y: positions[index * 2 + 1],
  }))
}

function matrixUnitScale(matrix: { applyToPoint(point: FracturePoint2D): FracturePoint2D }): number {
  const origin = matrix.applyToPoint({ x: 0, y: 0 })
  const unit = matrix.applyToPoint({ x: 1, y: 0 })
  return Math.hypot(unit.x - origin.x, unit.y - origin.y)
}

interface SharedEdge {
  readonly start: FracturePoint2D
  readonly end: FracturePoint2D
}

/** Finds reversed duplicate cell edges after stable source-local quantization. */
function sharedEdges(polygons: readonly (readonly FracturePoint2D[])[]): SharedEdge[] {
  const edges = new Map<string, { edge: SharedEdge; count: number }>()
  for (const polygon of polygons) {
    for (let index = 0; index < polygon.length; index++) {
      const start = polygon[index]
      const end = polygon[(index + 1) % polygon.length]
      const key = edgeKey(start, end)
      const existing = edges.get(key)
      if (existing) existing.count++
      else edges.set(key, { edge: { start, end }, count: 1 })
    }
  }
  return Array.from(edges.values()).filter(entry => entry.count === 2).map(entry => entry.edge)
}

function edgeKey(start: FracturePoint2D, end: FracturePoint2D): string {
  const a = pointKey(start)
  const b = pointKey(end)
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function pointKey(point: FracturePoint2D): string {
  return `${Math.round(point.x * EDGE_QUANTIZATION)},${Math.round(point.y * EDGE_QUANTIZATION)}`
}
