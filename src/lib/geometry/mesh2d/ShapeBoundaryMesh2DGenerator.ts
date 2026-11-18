import type { PathDefinition } from '@/lib/geometry/PathCommand'
import { ShapeToPathConverter, type Size } from '@/lib/geometry/ShapeToPathConverter'
import type { ShapeKind, ShapeParams } from '@/lib/types'
import type {
  SplineContour,
  SplineHandle,
  SplinePathData,
  SplinePoint,
  SplineSegment,
} from '@/lib/types/spline'
import type { Mesh2DData, Mesh2DGeometry, Mesh2DTopology } from '@/lib/types/mesh2d'
import { Mesh2DTopologyHasher } from './Mesh2DTopologyHasher'
import { SplineBoundaryMesh2DGenerator, type SplineBoundaryMesh2DOptions } from './SplineBoundaryMesh2DGenerator'

export type Mesh2DShapeKind = ShapeKind | 'circle'

export interface ShapeBoundaryInput {
  readonly kind: Mesh2DShapeKind
  readonly size: Size
  readonly params?: ShapeParams
  readonly cornerRadius?: number
}

/**
 * Adapts closed parametric 2D shapes to the validated boundary mesh pipeline.
 *
 * Shape geometry is read from `ShapeToPathConverter`, then converted into a
 * deterministic, in-memory spline boundary. The source shape is borrowed and
 * never mutated. Open primitives are rejected because this subsystem creates
 * filled surfaces, not stroke ribbons. Full rings are split into an outer
 * contour and a real even-odd hole before validation. No intermediate spline
 * is persisted in scene JSON.
 */
export class ShapeBoundaryMesh2DGenerator {
  static readonly supportedKinds: readonly Mesh2DShapeKind[] = [
    'rect', 'circle', 'ellipse', 'capsule', 'polygon', 'star', 'ring', 'blob',
  ]

  constructor(
    private readonly splineGenerator = new SplineBoundaryMesh2DGenerator(),
    private readonly hasher = new Mesh2DTopologyHasher(),
  ) {}

  /** Returns whether a shape kind has a closed filled-surface adapter. */
  supports(kind: Mesh2DShapeKind): boolean {
    return ShapeBoundaryMesh2DGenerator.supportedKinds.includes(kind)
  }

  /** Generates portable shape-linked Mesh2D data in source-local pixels. */
  generate(
    sourceLayerId: string,
    input: ShapeBoundaryInput,
    options: SplineBoundaryMesh2DOptions = {},
  ): Mesh2DData {
    if (!sourceLayerId) throw new Error('Shape-boundary Mesh2D requires a source layer id')
    const spline = this.toBoundarySpline(input)
    const generated = this.splineGenerator.generate(sourceLayerId, spline, options)
    if (generated.source.kind !== 'splineBoundary') throw new Error('Unexpected boundary generator source')
    return {
      ...generated,
      source: { ...generated.source, kind: 'shapeBoundary' },
      geometry: this.renameVertexOwnership(generated.geometry),
    }
  }

  /** Computes the same deterministic source identity used by `generate`. */
  fingerprint(input: ShapeBoundaryInput, options: SplineBoundaryMesh2DOptions = {}): string {
    return this.splineGenerator.fingerprint(this.toBoundarySpline(input), options)
  }

  /** Returns false for another recipe kind or invalid/changed shape geometry. */
  isCurrent(data: Mesh2DData, input: ShapeBoundaryInput): boolean {
    if (data.source.kind !== 'shapeBoundary') return false
    try {
      return data.source.sourceFingerprint === this.fingerprint(input, {
        flattenTolerance: data.source.flattenTolerance,
      })
    } catch {
      return false
    }
  }

  private toBoundarySpline(input: ShapeBoundaryInput): SplinePathData {
    if (!this.supports(input.kind)) {
      throw new Error(`Shape "${input.kind}" is open or unsupported as a Mesh2D boundary`)
    }
    if (!Number.isFinite(input.size.width) || !Number.isFinite(input.size.height)
      || input.size.width <= 0 || input.size.height <= 0) {
      throw new Error('Shape-boundary Mesh2D requires a finite positive source size')
    }
    const path = ShapeToPathConverter.convert(
      input.kind,
      input.size,
      input.params,
      input.cornerRadius ?? 0,
    )
    if (!path.closed) throw new Error(`Shape "${input.kind}" must be closed before triangulation`)
    const ringSweep = input.kind === 'ring'
      ? Math.abs((input.params?.endAngle ?? 360) - (input.params?.startAngle ?? 0))
      : 0
    if (ringSweep > 360 + 1e-9) throw new Error('Shape ring sweep cannot exceed 360 degrees for Mesh2D')
    const fullRing = input.kind === 'ring' && ringSweep >= 360 - 1e-9
    const paths = fullRing ? splitFullRing(path) : [path]
    return pathsToDeterministicSpline(paths, fullRing && paths.length > 1 ? 'evenodd' : 'nonzero')
  }

  private renameVertexOwnership(geometry: Mesh2DGeometry): Mesh2DGeometry {
    const topologyWithoutHash: Omit<Mesh2DTopology, 'topologyHash'> = {
      ...geometry.topology,
      vertexIds: geometry.topology.vertexIds.map(id => id.replace(/^spline:/, 'shape:')),
    }
    return {
      ...geometry,
      topology: { ...topologyWithoutHash, topologyHash: this.hasher.hash(topologyWithoutHash) },
    }
  }
}

interface Anchor {
  x: number
  y: number
  in?: { x: number; y: number }
  out?: { x: number; y: number }
}

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

function pathsToDeterministicSpline(paths: readonly PathDefinition[], fillRule: SplinePathData['fillRule']): SplinePathData {
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
    contours[contourId] = { id: contourId, closed: true, pointIds, segmentIds }
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
  if (!path.closed || !closed) throw new Error('Shape boundary path must end with a close command')
  if (anchors.length > 1 && samePoint(anchors[0], anchors.at(-1)!)) {
    const duplicate = anchors.pop()!
    anchors[0].in = duplicate.in
  }
  if (anchors.length < 3) throw new Error('Shape boundary needs at least three distinct points')
  return anchors
}

function samePoint(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) <= 1e-9 && Math.abs(a.y - b.y) <= 1e-9
}
