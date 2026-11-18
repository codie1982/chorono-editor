import type { SplinePathData } from '@/lib/types/spline'
import { buildSplineData, type AnchorSpec } from '../util/buildSplineData'
import { sampleContourEdges, sliceSampledEdge, type Vec2 } from './sampleContour'

export interface CornerOptions { contourId: string; pointIds: readonly string[]; amount: number; mode: 'chamfer' | 'fillet' }
const EPS = 1e-6

/**
 * Cut selected interior corners by layer-local arc distance and bridge them
 * with a line (chamfer) or tangent cubic (fillet). A line-line fillet uses the
 * requested circular radius; curved edges use the same corner tangent cut and
 * a G1 cubic approximation. Source curves are sampled to 0.25 local pixels.
 * Only the chosen contour is replaced; other contour/subshape records survive.
 * Callers must reject animation tracks addressing this contour before commit,
 * because its point/segment IDs change. Invalid, overlapping cuts throw.
 */
export function treatSplineCorners(data: SplinePathData, options: CornerOptions): SplinePathData {
  const { contour, edges } = sampleContourEdges(data, options.contourId)
  if (!Number.isFinite(options.amount) || options.amount <= 0 || options.amount > 10000) throw new Error('Corner distance/radius must be between 0 and 10000 local pixels.')
  const selected = new Set(options.pointIds)
  if (!selected.size) throw new Error('Select at least one corner.')
  const n = contour.pointIds.length
  for (const id of Array.from(selected)) if (!contour.pointIds.includes(id)) throw new Error('Selected corner does not belong to this contour.')
  const cuts = contour.pointIds.map((id, index) => {
    if (!selected.has(id)) return 0
    if (!contour.closed && (index === 0 || index === n - 1)) throw new Error('Open contour endpoints cannot be chamfered or filleted.')
    const incoming = edges[(index - 1 + edges.length) % edges.length].points
    const outgoing = edges[index].points
    const a = unit(sub(incoming.at(-1)!, incoming.at(-2)!))
    const b = unit(sub(outgoing[1], outgoing[0]))
    const turn = Math.atan2(Math.abs(a.x * b.y - a.y * b.x), a.x * b.x + a.y * b.y)
    if (turn <= 1e-3 || Math.PI - turn <= 1e-3) throw new Error('Corner is straight or reverses direction.')
    return options.mode === 'fillet' ? options.amount * Math.tan(turn / 2) : options.amount
  })
  const slices = edges.map((edge, index) => {
    const next = (index + 1) % n
    if (cuts[index] + cuts[next] >= edge.length - EPS) throw new Error('Corner cuts overlap on a short edge; reduce the distance or radius.')
    return sliceSampledEdge(edge, cuts[index], edge.length - cuts[next])
  })
  const anchors: AnchorSpec[] = [{ ...slices[0][0], type: 'corner' }]
  const appendLine = (point: Vec2) => {
    const prev = anchors.at(-1)!
    if (Math.hypot(point.x - prev.x, point.y - prev.y) > EPS) anchors.push({ ...point, type: 'corner' })
  }
  const appendBridge = (next: Vec2, incoming: Vec2, outgoing: Vec2, close: boolean) => {
    const start = anchors.at(-1)!
    if (options.mode === 'chamfer') {
      if (!close) appendLine(next)
      return
    }
    const a = unit(incoming), b = unit(outgoing)
    const turn = Math.atan2(Math.abs(a.x * b.y - a.y * b.x), a.x * b.x + a.y * b.y)
    // Exact circular cubic for line-line corners; G1 approximation elsewhere.
    const handleLength = (4 / 3) * Math.tan(turn / 4) * options.amount
    start.out = { x: start.x + a.x * handleLength, y: start.y + a.y * handleLength }
    const end = close ? anchors[0] : { ...next, type: 'corner' as const }
    end.in = { x: end.x - b.x * handleLength, y: end.y - b.y * handleLength }
    if (!close) anchors.push(end)
  }
  for (let index = 0; index < slices.length; index++) {
    const slice = slices[index]
    if (index > 0 && cuts[index]) {
      const previous = slices[index - 1]
      appendBridge(slice[0], sub(previous.at(-1)!, previous.at(-2)!), sub(slice[1], slice[0]), false)
    }
    for (let j = 1; j < slice.length; j++) {
      // A closed final edge ends at the first anchor unless corner 0 is cut.
      if (contour.closed && index === slices.length - 1 && j === slice.length - 1 && !cuts[0]) continue
      appendLine(slice[j])
    }
  }
  if (contour.closed && cuts[0]) {
    const last = slices.at(-1)!
    appendBridge(slices[0][0], sub(last.at(-1)!, last.at(-2)!), sub(slices[0][1], slices[0][0]), true)
  }
  if (anchors.length < (contour.closed ? 3 : 2) || anchors.length > 8192) throw new Error('Corner result has invalid or excessive topology.')
  const generated = buildSplineData({ kind: 'custom', name: 'Edited contour', source: 'edited', contours: [{ closed: contour.closed, anchors }] })
  const fresh = Object.values(generated.contours)[0]
  const removedPoints = new Set(contour.pointIds), removedSegments = new Set(contour.segmentIds)
  for (const other of Object.values(data.contours)) if (other.id !== contour.id && other.pointIds.some(id => removedPoints.has(id))) throw new Error('Shared spline points cannot be replaced by a corner operation.')
  const without = <T>(source: Record<string, T>, removed: Set<string>): Record<string, T> => Object.fromEntries(Object.entries(source).filter(([id]) => !removed.has(id)))
  const removedHandles = new Set(Object.values(data.handles).filter(handle => removedPoints.has(handle.pointId)).map(handle => handle.id))
  const owners = Object.values(data.subShapes).filter(sub => sub.contourIds.includes(contour.id))
  if (owners.length !== 1) throw new Error('Corner operation requires one owning subshape.')
  return {
    ...data,
    points: { ...without(data.points, removedPoints), ...generated.points },
    handles: { ...without(data.handles, removedHandles), ...generated.handles },
    segments: { ...without(data.segments, removedSegments), ...generated.segments },
    contours: { ...data.contours, [contour.id]: { ...fresh, id: contour.id } },
    subShapes: { ...data.subShapes, [owners[0].id]: { ...owners[0], source: 'edited', editable: true, generatorParams: undefined } },
  }
}

function sub(a: Vec2, b: Vec2): Vec2 { return { x: a.x - b.x, y: a.y - b.y } }
function unit(value: Vec2): Vec2 {
  const length = Math.hypot(value.x, value.y)
  if (length <= EPS) throw new Error('Corner tangent is undefined.')
  return { x: value.x / length, y: value.y / length }
}
