// ── Spline construction helper ────────────────────────────────────────────────
//
// Primitives describe geometry as a list of anchor specs per contour. This
// builder expands that into the normalized SplinePathData (points/handles/
// segments/contours) with fresh ids, so each primitive file stays small.

import type {
  SplinePathData, SplinePointType, SplinePrimitiveKind, SplineGeneratorParams,
  SplinePoint, SplineHandle, SplineSegment, SplineContour, SplineSubShape,
} from '@/lib/types/spline'
import { uid } from './uid'

export interface AnchorSpec {
  x: number
  y: number
  type: SplinePointType
  /** Incoming handle in layer-local absolute coords. */
  in?:  { x: number; y: number }
  /** Outgoing handle in layer-local absolute coords. */
  out?: { x: number; y: number }
}

export interface ContourSpec {
  closed: boolean
  anchors: AnchorSpec[]
}

export interface BuildSplineInput {
  kind:      SplinePrimitiveKind
  name:      string
  contours:  ContourSpec[]
  params?:   SplineGeneratorParams
  fillRule?: 'nonzero' | 'evenodd'
  combineMode?: SplineSubShape['combineMode']
}

/**
 * Builds a SplinePathData containing exactly one SubShape with the given
 * contours. Each contour becomes points + handles + segments + a contour record.
 */
export function buildSplineData(input: BuildSplineInput): SplinePathData {
  const points:   Record<string, SplinePoint>   = {}
  const handles:  Record<string, SplineHandle>  = {}
  const segments: Record<string, SplineSegment> = {}
  const contours: Record<string, SplineContour> = {}

  const contourIds: string[] = []

  for (const c of input.contours) {
    const pointIds:   string[] = []
    const segmentIds: string[] = []
    const outHandleOf: Record<string, boolean> = {}
    const inHandleOf:  Record<string, boolean> = {}

    // 1. Points + handles
    for (const a of c.anchors) {
      const pid = uid('pt')
      points[pid] = { id: pid, x: a.x, y: a.y, type: a.type }
      pointIds.push(pid)

      if (a.out) {
        const hid = uid('h')
        handles[hid] = { id: hid, pointId: pid, kind: 'out', x: a.out.x, y: a.out.y, locked: false }
        outHandleOf[pid] = true
      }
      if (a.in) {
        const hid = uid('h')
        handles[hid] = { id: hid, pointId: pid, kind: 'in', x: a.in.x, y: a.in.y, locked: false }
        inHandleOf[pid] = true
      }
    }

    // 2. Segments between consecutive points (closing segment when closed)
    const n = pointIds.length
    const segCount = c.closed ? n : n - 1
    for (let i = 0; i < segCount; i++) {
      const fromId = pointIds[i]
      const toId   = pointIds[(i + 1) % n]
      const isCubic = outHandleOf[fromId] || inHandleOf[toId]
      const sid = uid('seg')
      segments[sid] = {
        id: sid,
        fromPointId: fromId,
        toPointId:   toId,
        type: isCubic ? 'cubic' : 'line',
      }
      segmentIds.push(sid)
    }

    const cid = uid('cnt')
    contours[cid] = { id: cid, closed: c.closed, pointIds, segmentIds }
    contourIds.push(cid)
  }

  const subId = uid('sub')
  const subShapes: Record<string, SplineSubShape> = {
    [subId]: {
      id: subId,
      name: input.name,
      kind: input.kind,
      source: 'generated',
      contourIds,
      combineMode: input.combineMode ?? 'add',
      generatorParams: input.params,
      editable: false,
    },
  }

  return {
    subShapes,
    points,
    handles,
    segments,
    contours,
    fillRule: input.fillRule ?? 'nonzero',
  }
}
