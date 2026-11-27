import type { PathDefinition } from '../PathCommand'
import { ShapeToPathConverter, type Size } from '../ShapeToPathConverter'
import type { ShapeKind, ShapeParams } from '../../types'
import type { SplineContour, SplineHandle, SplinePathData, SplinePoint, SplineSegment } from '../../types/spline'

/** Parametric shape boundary in source-local pixels; transforms are deliberately external. */
export interface ShapeSplineInput {
  readonly kind: ShapeKind | 'circle'
  readonly size: Size
  readonly params?: ShapeParams
  readonly cornerRadius?: number
}

/** Stateless, deterministic primitive-to-normalized-spline converter. Preserves cubic
 * controls, promotes quadratic controls exactly and separates full-ring seams.
 * Closed and open primitives share this walker. No source mutation or buffers owned. */
export class ShapeToSplineConverter {
  /** Convert admitted finite geometry without flattening curves. IDs are local to
   * the result layer. Records retain legacy generated ownership; the conversion
   * service assigns editable elements. Excessive counts reject before allocating. */
  convert(input: ShapeSplineInput): SplinePathData {
    if (!['rect', 'circle', 'ellipse', 'capsule', 'line', 'arrow', 'polygon', 'star', 'ring', 'arc', 'spiral', 'wave', 'blob'].includes(input.kind)) throw new Error('Unsupported shape kind for conversion.')
    const { width, height } = input.size
    if (![width, height].every(n => Number.isFinite(n) && n > 0)
      || Object.values(input.params ?? {}).some(n => typeof n === 'number' && !Number.isFinite(n))
      || !Number.isFinite(input.cornerRadius ?? 0)) throw new Error('Shape geometry must be finite with a positive size.')
    const count = ShapeToPathConverter.estimateCommandCount(input.kind, input.size, input.params, input.cornerRadius)
    if (!Number.isSafeInteger(count) || count < 1 || count > 2048) throw new Error('Conversion path-command budget exceeded.')
    const path = ShapeToPathConverter.convert(input.kind, input.size, input.params, input.cornerRadius)
    const sweep = input.kind === 'ring' ? Math.abs((input.params?.endAngle ?? 360) - (input.params?.startAngle ?? 0)) : 0
    if (sweep > 360 + 1e-9) throw new Error('Shape ring sweep cannot exceed 360 degrees.')
    const paths = input.kind === 'ring' && sweep >= 360 - 1e-9 ? splitFullRing(path) : [path]
    return pathsToDeterministicSpline(paths, paths.length > 1 ? 'evenodd' : 'nonzero')
  }
}

/** Normalize multiple M…Z/open paths through the same exact control walker.
 * Used for clipped polygon output as well as curved single-object paths. */
export function pathDefinitionToSpline(path: PathDefinition, fillRule: SplinePathData['fillRule']): SplinePathData {
  const paths: PathDefinition[] = []
  let commands: PathDefinition['commands'] = []
  for (const command of path.commands) {
    if (command.type === 'M' && commands.length) { paths.push({ commands, closed: false }); commands = [] }
    commands.push(command)
    if (command.type === 'Z') { paths.push({ commands, closed: true }); commands = [] }
  }
  if (commands.length) paths.push({ commands, closed: false })
  return pathsToDeterministicSpline(paths, fillRule)
}

interface Anchor {
  x: number
  y: number
  in?: { x: number; y: number }
  out?: { x: number; y: number }
}

/** Separate the primitive's retraced ring seam into real outer/hole contours.
 * A zero-radius inner loop becomes a filled disk; other degeneracy is rejected. */
function splitFullRing(path: PathDefinition): PathDefinition[] {
  const commands = path.commands.slice(0, -1)
  if (path.commands.at(-1)?.type !== 'Z' || commands.length % 2 !== 0 || commands.some(command => !['M', 'L'].includes(command.type))) {
    throw new Error('Full ring boundary has an unsupported command layout')
  }
  const half = commands.length / 2
  const outer = commands.slice(0, half)
  const inner = commands.slice(half)
  if (outer[0]?.type !== 'M' || inner.length === 0 || inner[0].type !== 'L') {
    throw new Error('Full ring boundary could not be separated into contours')
  }
  const closeContour = (commandsToClose: typeof commands): PathDefinition => {
    const compacted = commandsToClose.filter((command, index) => {
      const previous = commandsToClose[index - 1]
      if (command.type === 'Z') throw new Error('Ring contour closes before its boundary ends')
      if (previous?.type === 'Z') throw new Error('Ring contour contains commands after closing')
      return !previous || !samePoint(previous, command)
    })
    const first = compacted[0]
    const last = compacted.at(-1)
    if (!first || first.type !== 'M' || !last || last.type === 'Z') throw new Error('Ring contour is empty')
    const deduplicated = samePoint(first, last) ? compacted.slice(0, -1) : compacted
    return { closed: true, commands: [...deduplicated, { type: 'Z' }] }
  }
  const innerAsPath = [{ type: 'M' as const, x: inner[0].x, y: inner[0].y }, ...inner.slice(1)]
  const outerPath = closeContour(outer)
  const innerPath = closeContour(innerAsPath)
  if (innerPath.commands.length <= 2) return [outerPath]
  return [outerPath, innerPath]
}

/** Shared exact control walker. Preserves legacy shape-boundary IDs/fingerprint
 * semantics; callers choose editable element ownership after construction. */
export function pathsToDeterministicSpline(paths: readonly PathDefinition[], fillRule: SplinePathData['fillRule']): SplinePathData {
  const points: Record<string, SplinePoint> = {}
  const handles: Record<string, SplineHandle> = {}
  const segments: Record<string, SplineSegment> = {}
  const contours: Record<string, SplineContour> = {}
  const contourIds: string[] = []

  paths.forEach((path, contourIndex) => {
    const anchors = pathAnchors(path)
    const contourId = `shape-contour-${contourIndex}`
    const pointIds = anchors.map((_, pointIndex) => `shape-point-${contourIndex}-${pointIndex}`)
    const segmentIds: string[] = []
    anchors.forEach((anchor, pointIndex) => {
      const pointId = pointIds[pointIndex]
      points[pointId] = {
        id: pointId,
        x: anchor.x,
        y: anchor.y,
        type: anchor.in || anchor.out ? 'bezierCorner' : 'corner',
      }
      if (anchor.in) {
        const id = `shape-handle-in-${contourIndex}-${pointIndex}`
        handles[id] = { id, pointId, kind: 'in', ...anchor.in, locked: false }
      }
      if (anchor.out) {
        const id = `shape-handle-out-${contourIndex}-${pointIndex}`
        handles[id] = { id, pointId, kind: 'out', ...anchor.out, locked: false }
      }
    })
    anchors.forEach((anchor, pointIndex) => {
      if (!path.closed && pointIndex === anchors.length - 1) return
      const nextIndex = (pointIndex + 1) % anchors.length
      const id = `shape-segment-${contourIndex}-${pointIndex}`
      segments[id] = {
        id,
        fromPointId: pointIds[pointIndex],
        toPointId: pointIds[nextIndex],
        type: anchor.out || anchors[nextIndex].in ? 'cubic' : 'line',
      }
      segmentIds.push(id)
    })
    contours[contourId] = { id: contourId, closed: path.closed, pointIds, segmentIds }
    contourIds.push(contourId)
  })

  return {
    subShapes: {
      'shape-subshape-0': {
        id: 'shape-subshape-0', name: 'Shape Boundary', kind: 'custom', source: 'generated',
        contourIds, combineMode: 'add', editable: false,
      },
    },
    points,
    handles,
    segments,
    contours,
    fillRule,
  }
}

/** Preserve local absolute cubic controls, promote Q exactly, and merge a
 * duplicate closing anchor into the first point without dropping its tangent. */
function pathAnchors(path: PathDefinition): Anchor[] {
  const anchors: Anchor[] = []
  let closed = false
  for (const command of path.commands) {
    if (command.type === 'M') {
      if (anchors.length > 0) throw new Error('Shape boundary contains more than one contour in one path')
      anchors.push({ x: command.x, y: command.y })
    } else if (command.type === 'L') {
      anchors.push({ x: command.x, y: command.y })
    } else if (command.type === 'C') {
      const previous = anchors.at(-1)
      if (!previous) throw new Error('Cubic shape command has no start point')
      previous.out = { x: command.x1, y: command.y1 }
      anchors.push({ x: command.x, y: command.y, in: { x: command.x2, y: command.y2 } })
    } else if (command.type === 'Q') {
      const previous = anchors.at(-1)
      if (!previous) throw new Error('Quadratic shape command has no start point')
      previous.out = {
        x: previous.x + (2 / 3) * (command.x1 - previous.x),
        y: previous.y + (2 / 3) * (command.y1 - previous.y),
      }
      anchors.push({
        x: command.x,
        y: command.y,
        in: {
          x: command.x + (2 / 3) * (command.x1 - command.x),
          y: command.y + (2 / 3) * (command.y1 - command.y),
        },
      })
    } else {
      closed = true
    }
  }
  if (path.closed !== closed) throw new Error('Path closure must agree with its commands')
  if (closed && anchors.length > 1 && samePoint(anchors[0], anchors.at(-1)!)) {
    const duplicate = anchors.pop()!
    anchors[0].in = duplicate.in
  }
  if (anchors.length < (closed ? 3 : 2)) throw new Error('Path has too few distinct points')
  return anchors
}

/** Closure-only tolerance in local px; never weld arbitrary interior points. */
function samePoint(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) <= 1e-9 && Math.abs(a.y - b.y) <= 1e-9
}
