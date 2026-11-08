import type { NormalizedPathCommand, PathDefinition } from '@/lib/geometry/PathCommand'
import { C, L, M, Q } from '@/lib/geometry/PathCommand'

interface Point { x: number; y: number }
interface Segment {
  points: Point[]
  contour: number
  startLength: number
  length: number
  samples: number[]
}

const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})

/** Split a line, quadratic or cubic without flattening its geometry. */
function split(points: Point[], t: number): [Point[], Point[]] {
  const left = [points[0]]
  const right = [points[points.length - 1]]
  let row = points
  while (row.length > 1) {
    row = row.slice(1).map((p, i) => lerp(row[i], p, t))
    left.push(row[0])
    right.unshift(row[row.length - 1])
  }
  return [left, right]
}

function pointAt(points: Point[], t: number): Point {
  let row = points
  while (row.length > 1) row = row.slice(1).map((p, i) => lerp(row[i], p, t))
  return row[0]
}

function buildSegments(path: PathDefinition): { segments: Segment[]; length: number } {
  const segments: Segment[] = []
  let current: Point = { x: 0, y: 0 }
  let start = current
  let contour = 0
  let length = 0

  const add = (points: Point[]) => {
    const count = points.length === 2 ? 1 : 32
    const samples = [0]
    let previous = points[0]
    let segmentLength = 0
    for (let i = 1; i <= count; i++) {
      const p = pointAt(points, i / count)
      segmentLength += Math.hypot(p.x - previous.x, p.y - previous.y)
      samples.push(segmentLength)
      previous = p
    }
    if (segmentLength > 0) {
      segments.push({ points, contour, startLength: length, length: segmentLength, samples })
      length += segmentLength
    }
    current = points[points.length - 1]
  }

  for (const cmd of path.commands) {
    switch (cmd.type) {
      case 'M':
        current = start = { x: cmd.x, y: cmd.y }
        contour++
        break
      case 'L': add([current, { x: cmd.x, y: cmd.y }]); break
      case 'Q': add([current, { x: cmd.x1, y: cmd.y1 }, { x: cmd.x, y: cmd.y }]); break
      case 'C': add([current, { x: cmd.x1, y: cmd.y1 }, { x: cmd.x2, y: cmd.y2 }, { x: cmd.x, y: cmd.y }]); break
      case 'Z': add([current, start]); break
    }
  }
  return { segments, length }
}

function parameterAtLength(segment: Segment, length: number): number {
  if (length <= 0) return 0
  if (length >= segment.length) return 1
  const samples = segment.samples
  let i = 1
  while (samples[i] < length) i++
  const fraction = (length - samples[i - 1]) / Math.max(Number.EPSILON, samples[i] - samples[i - 1])
  return (i - 1 + fraction) / (samples.length - 1)
}

function subcurve(segment: Segment, start: number, end: number): Point[] {
  const t0 = parameterAtLength(segment, start)
  const t1 = parameterAtLength(segment, end)
  const left = t1 === 1 ? segment.points : split(segment.points, t1)[0]
  return t0 === 0 ? left : split(left, t0 / t1)[1]
}

function curveCommand(points: Point[]): NormalizedPathCommand {
  const end = points[points.length - 1]
  if (points.length === 2) return L(end.x, end.y)
  if (points.length === 3) return Q(points[1].x, points[1].y, end.x, end.y)
  return C(points[1].x, points[1].y, points[2].x, points[2].y, end.x, end.y)
}

/**
 * Trim sequentially across all spline contours by arc length. Curves use a
 * 32-sample length lookup but remain exact quadratic/cubic subcurves when
 * drawn. Moves never contribute length or create connecting strokes.
 *
 * Offset rotates the visible window (including negative/wrapped offsets).
 * An empty window emits no geometry; a full window preserves Z commands.
 * Partial windows are open paths so closing cannot redraw the hidden part.
 */
export function trimSplinePath(
  path: PathDefinition,
  start: number,
  end: number,
  offset = 0,
): PathDefinition {
  const s = Math.max(0, Math.min(1, start))
  const e = Math.max(0, Math.min(1, end))
  const span = e - s
  if (!(span > 0)) return { commands: [], closed: false }
  if (span >= 1) return path

  const { segments, length } = buildSegments(path)
  if (!(length > 0)) return { commands: [], closed: false }
  const phase = s + (Number.isFinite(offset) ? offset : 0)
  const from = phase - Math.floor(phase)
  const to = from + span
  const ranges = to <= 1 ? [[from, to]] : [[from, 1], [0, to - 1]]
  const commands: NormalizedPathCommand[] = []

  for (const [a, b] of ranges) {
    let previousContour = -1
    for (const segment of segments) {
      const lo = Math.max(0, a * length - segment.startLength)
      const hi = Math.min(segment.length, b * length - segment.startLength)
      if (hi <= lo) continue
      const points = subcurve(segment, lo, hi)
      if (previousContour !== segment.contour) commands.push(M(points[0].x, points[0].y))
      commands.push(curveCommand(points))
      previousContour = segment.contour
    }
  }
  return { commands, closed: false }
}
