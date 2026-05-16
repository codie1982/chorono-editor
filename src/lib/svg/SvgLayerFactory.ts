// ── SvgLayerFactory ───────────────────────────────────────────────────────────
//
// Builds Chorono Layer objects from normalized SVG data:
//   - NormalizedPathCommand[] (the geometry, already in user-space coords)
//   - SvgImportContext (composed transform from root, inherited style)
//
// The output is always a `path` type Layer (Bezier path layer from Sprint 4) —
// every SVG primitive funnels through this single converter so the rest of
// the editor sees only one kind of imported geometry.
//
// Coordinate handling:
//   1. Apply the SvgImportContext.transform to every command's points →
//      composition-space coordinates.
//   2. Compute the layer's AABB from the transformed points.
//   3. Position layer.transform.x/y at the AABB top-left so commands become
//      LAYER-LOCAL (renderer translates by .x/.y before drawing the path).

import type {
  Layer, PathAnchor, BezierPath, ShapeStyle,
} from '@/lib/types'
import type {
  NormalizedPathCommand, MoveToCommand, LineToCommand,
  CubicToCommand, QuadToCommand,
} from '@/lib/geometry'
import { Bounds } from '@/lib/geometry'
import type { Matrix2D } from '@/lib/geometry/Matrix2D'
import type { SvgImportContext } from '@/lib/types/svg'
import type { SvgComputedStyle } from './SvgStyleParser'

let layerCounter = 0
const nextId = (kind: string) => `svg_${kind}_${++layerCounter}_${Date.now().toString(36).slice(-4)}`

export class SvgLayerFactory {
  /**
   * Build a path-type Layer from normalized commands + context.
   * Returns null if the path is empty or all points collapse to a single point.
   */
  buildPathLayer(
    commands: NormalizedPathCommand[],
    ctx:      SvgImportContext,
    style:    SvgComputedStyle,
    name:     string,
  ): Layer | null {
    if (commands.length === 0) return null

    // ── Apply context.transform to every coordinate ─────────────────────────
    const worldCommands = commands.map(cmd => transformCommand(cmd, ctx.transform))

    // ── Compute AABB so we can normalise to layer-local coords ──────────────
    const points = collectPoints(worldCommands)
    if (points.length === 0) return null
    const bounds = Bounds.fromPoints(points)
    if (bounds.width === 0 && bounds.height === 0) return null

    // ── Shift commands into layer-local space ───────────────────────────────
    const localCommands = worldCommands.map(cmd => shiftCommand(cmd, -bounds.x, -bounds.y))

    // ── Convert commands to BezierPath anchors ──────────────────────────────
    const path = commandsToBezierPath(localCommands)
    if (path.anchors.length === 0) return null

    // ── Build the Chorono layer ─────────────────────────────────────────────
    const id    = nextId('path')
    const fill   = resolveFill(style)
    const stroke = resolveStroke(style)

    return {
      id,
      name,
      type: 'path',
      transform: {
        x: bounds.x,
        y: bounds.y,
        scaleX: 1,
        scaleY: 1,
        rotationDeg: 0,
        anchorX: bounds.width  / 2,
        anchorY: bounds.height / 2,
      },
      opacity: ctx.opacity,
      size: { width: bounds.width, height: bounds.height },
      style: { ...fill, ...stroke },
      path,
    }
  }
}

// ── Coordinate transform helpers ──────────────────────────────────────────────

function transformCommand(cmd: NormalizedPathCommand, m: Matrix2D): NormalizedPathCommand {
  switch (cmd.type) {
    case 'M': return { type: 'M', ...m.applyToPoint({ x: cmd.x, y: cmd.y }) }
    case 'L': return { type: 'L', ...m.applyToPoint({ x: cmd.x, y: cmd.y }) }
    case 'C': {
      const p1 = m.applyToPoint({ x: cmd.x1, y: cmd.y1 })
      const p2 = m.applyToPoint({ x: cmd.x2, y: cmd.y2 })
      const p3 = m.applyToPoint({ x: cmd.x,  y: cmd.y  })
      return { type: 'C', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, x: p3.x, y: p3.y }
    }
    case 'Q': {
      const p1 = m.applyToPoint({ x: cmd.x1, y: cmd.y1 })
      const p2 = m.applyToPoint({ x: cmd.x,  y: cmd.y  })
      return { type: 'Q', x1: p1.x, y1: p1.y, x: p2.x, y: p2.y }
    }
    case 'Z': return { type: 'Z' }
  }
}

function shiftCommand(cmd: NormalizedPathCommand, dx: number, dy: number): NormalizedPathCommand {
  switch (cmd.type) {
    case 'M': return { type: 'M', x: cmd.x + dx, y: cmd.y + dy }
    case 'L': return { type: 'L', x: cmd.x + dx, y: cmd.y + dy }
    case 'C': return { type: 'C',
      x1: cmd.x1 + dx, y1: cmd.y1 + dy,
      x2: cmd.x2 + dx, y2: cmd.y2 + dy,
      x:  cmd.x  + dx, y:  cmd.y  + dy }
    case 'Q': return { type: 'Q',
      x1: cmd.x1 + dx, y1: cmd.y1 + dy,
      x:  cmd.x  + dx, y:  cmd.y  + dy }
    case 'Z': return { type: 'Z' }
  }
}

function collectPoints(cmds: NormalizedPathCommand[]): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = []
  for (const c of cmds) {
    switch (c.type) {
      case 'M': case 'L':
        pts.push({ x: c.x, y: c.y }); break
      case 'C':
        pts.push({ x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 }, { x: c.x, y: c.y }); break
      case 'Q':
        pts.push({ x: c.x1, y: c.y1 }, { x: c.x, y: c.y }); break
    }
  }
  return pts
}

// ── Commands → BezierPath anchors ─────────────────────────────────────────────
//
// BezierPath stores anchors with optional in/out handles (cubic only — quad is
// converted on the fly). Convert each L/C/Q to one anchor.

function commandsToBezierPath(cmds: NormalizedPathCommand[]): BezierPath {
  const anchors: PathAnchor[] = []
  let closed = false

  for (const c of cmds) {
    switch (c.type) {
      case 'M':
        anchors.push({ x: c.x, y: c.y, pointType: 'corner' })
        break

      case 'L':
        anchors.push({ x: c.x, y: c.y, pointType: 'corner' })
        break

      case 'C': {
        // Previous anchor gets the outgoing handle (x1, y1).
        const prev = anchors[anchors.length - 1]
        if (prev) { prev.outX = c.x1; prev.outY = c.y1 }
        anchors.push({
          x: c.x, y: c.y,
          inX: c.x2, inY: c.y2,
          pointType: 'corner',
        })
        break
      }

      case 'Q': {
        // Quadratic → cubic conversion via the standard formula:
        //   c1 = p0 + 2/3 * (qc - p0)
        //   c2 = p2 + 2/3 * (qc - p2)
        const prev = anchors[anchors.length - 1]
        if (!prev) break
        const c1x = prev.x + (2 / 3) * (c.x1 - prev.x)
        const c1y = prev.y + (2 / 3) * (c.y1 - prev.y)
        const c2x = c.x   + (2 / 3) * (c.x1 - c.x)
        const c2y = c.y   + (2 / 3) * (c.y1 - c.y)
        prev.outX = c1x; prev.outY = c1y
        anchors.push({
          x: c.x, y: c.y,
          inX: c2x, inY: c2y,
          pointType: 'corner',
        })
        break
      }

      case 'Z':
        closed = true
        // If the closing edge needs a handle, the C-before-Z already added it
        // to the last anchor's out / wraps via the renderer's closed-path
        // logic. No anchor created here.
        break
    }
  }

  return { closed, anchors }
}

// ── Style resolution (SVG style → Chorono ShapeStyle) ─────────────────────────

function resolveFill(style: SvgComputedStyle): Partial<ShapeStyle> {
  if (style.fill === 'none') return { fill: undefined }
  if (!style.fill) return { fill: { type: 'solid', color: '#000000', opacity: 100 } } // SVG default = black
  return {
    fill: {
      type: 'solid',
      color: style.fill,
      opacity: clampPct(style.fillOpacity, 100),
    },
  }
}

function resolveStroke(style: SvgComputedStyle): Partial<ShapeStyle> {
  if (!style.stroke || style.stroke === 'none' || (style.strokeWidth ?? 0) <= 0) {
    return { stroke: undefined }
  }
  return {
    stroke: {
      color:   style.stroke,
      width:   style.strokeWidth ?? 1,
      opacity: clampPct(style.strokeOpacity, 100),
      lineCap:  style.strokeLinecap  ?? 'butt',
      lineJoin: style.strokeLinejoin ?? 'miter',
      ...(style.strokeDasharray ? { dashArray: style.strokeDasharray } : {}),
    },
  }
}

function clampPct(v: number | undefined, fallback: number): number {
  if (v === undefined) return fallback
  // SVG opacity is 0–1; we store 0–100.
  return Math.max(0, Math.min(100, v * 100))
}
