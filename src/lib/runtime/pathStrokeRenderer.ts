// ── Path Stroke Renderer ──────────────────────────────────────────────────────
// Draws layers of type 'pathStroke' onto a 2D canvas. Supports four path
// shapes (ellipse, circle, rect, custom SVG), two trim modes (static range
// and movingSegment "orbiting light"), an optional outer glow, and per-frame
// animation of `trim.offset` via the override map.

import type { Layer, PathStrokeData, PathStrokeDefinition } from '../types'
import type { OverrideMap } from '../evaluator'

// ─────────────────────────────────────────────────────────────────────────────
// Path length cache (custom paths only — analytic for the others)
// ─────────────────────────────────────────────────────────────────────────────

const lengthCache = new Map<string, number>()
let svgRoot: SVGSVGElement | null = null

function getSvgRoot(): SVGSVGElement {
  if (svgRoot) return svgRoot
  // SSR safety: callers gate on document existence.
  svgRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svgRoot.setAttribute('width',  '0')
  svgRoot.setAttribute('height', '0')
  svgRoot.style.position = 'absolute'
  svgRoot.style.visibility = 'hidden'
  svgRoot.style.pointerEvents = 'none'
  document.body.appendChild(svgRoot)
  return svgRoot
}

function customPathLength(d: string): number {
  const cached = lengthCache.get(d)
  if (cached !== undefined) return cached
  if (typeof document === 'undefined') return 0
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', d)
  getSvgRoot().appendChild(path)
  const len = path.getTotalLength()
  getSvgRoot().removeChild(path)
  lengthCache.set(d, len)
  return len
}

// ─────────────────────────────────────────────────────────────────────────────
// Build Path2D + total length per shape kind
// ─────────────────────────────────────────────────────────────────────────────

interface BuiltPath {
  path:   Path2D
  length: number
}

function buildPath(def: PathStrokeDefinition): BuiltPath {
  const p = new Path2D()
  switch (def.shapeType) {
    case 'circle': {
      const r = Math.max(1, (def.width ?? 100) / 2)
      p.arc(r, r, r, 0, Math.PI * 2)
      return { path: p, length: 2 * Math.PI * r }
    }
    case 'ellipse': {
      const rx = Math.max(1, (def.width  ?? 100) / 2)
      const ry = Math.max(1, (def.height ?? 100) / 2)
      p.ellipse(rx, ry, rx, ry, 0, 0, Math.PI * 2)
      // Ramanujan's approximation — accurate to ~1e-5 for our use.
      const h = ((rx - ry) ** 2) / ((rx + ry) ** 2)
      const length = Math.PI * (rx + ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)))
      return { path: p, length }
    }
    case 'rect': {
      const w = Math.max(1, def.width  ?? 100)
      const h = Math.max(1, def.height ?? 100)
      p.rect(0, 0, w, h)
      return { path: p, length: 2 * (w + h) }
    }
    case 'custom': {
      const d = def.customPath ?? ''
      if (!d) return { path: p, length: 0 }
      try {
        return { path: new Path2D(d), length: customPathLength(d) }
      } catch {
        return { path: p, length: 0 }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Override resolution
// ─────────────────────────────────────────────────────────────────────────────

function readOverride(
  overrides: OverrideMap,
  layerId: string,
  property: string,
  fallback: number,
): number {
  const v = overrides.get(`layers.${layerId}.${property}`)
  return typeof v === 'number' ? v : fallback
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render a pathStroke layer in its own canvas coordinate space. The caller is
 * responsible for transform / opacity / clipping; this function only handles
 * the path geometry, stroke style, trim window and optional glow.
 */
export function drawPathStrokeLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  overrides: OverrideMap,
): void {
  const data: PathStrokeData | undefined = layer.pathStroke
  if (!data) return

  const built = buildPath(data.path)
  if (built.length <= 0) return

  const offset        = clamp01(readOverride(overrides, layer.id, 'pathStroke.trim.offset',          data.trim.offset))
  const segmentLength = clamp01(readOverride(overrides, layer.id, 'pathStroke.trim.segmentLength',   data.trim.segmentLength ?? 0.2))
  const strokeWidth   = Math.max(0, readOverride(overrides, layer.id, 'pathStroke.stroke.width',     data.stroke.width))

  if (strokeWidth <= 0) return

  ctx.save()
  ctx.lineWidth = strokeWidth
  ctx.lineCap   = (data.stroke.cap ?? 'round') as CanvasLineCap
  ctx.strokeStyle = data.stroke.color

  applyTrim(ctx, built.length, data.trim.mode, segmentLength, offset)

  if (data.stroke.glow) {
    // Glow pass — draw with shadowBlur first, then a clean pass on top.
    ctx.save()
    ctx.shadowBlur  = data.stroke.glow.blur
    ctx.shadowColor = data.stroke.glow.color
    ctx.stroke(built.path)
    ctx.restore()
  }
  ctx.stroke(built.path)
  ctx.restore()
}

// ─────────────────────────────────────────────────────────────────────────────
// Trim math
// ─────────────────────────────────────────────────────────────────────────────

function applyTrim(
  ctx: CanvasRenderingContext2D,
  totalLength: number,
  mode: PathStrokeData['trim']['mode'],
  segmentLength: number,
  offset: number,
): void {
  if (mode === 'static') {
    // Static range: draw a chunk of length `segmentLength` starting at `offset`.
    const dashLen = totalLength * segmentLength
    const gapLen  = Math.max(0.0001, totalLength - dashLen)
    ctx.setLineDash([dashLen, gapLen])
    ctx.lineDashOffset = -totalLength * offset
    return
  }

  // movingSegment: same dash/gap pattern, but the offset is the *phase* that
  // shifts the visible segment around the path — making it orbit / sweep /
  // worm-trail along the geometry.
  const dashLen = totalLength * segmentLength
  const gapLen  = Math.max(0.0001, totalLength - dashLen)
  ctx.setLineDash([dashLen, gapLen])
  ctx.lineDashOffset = -totalLength * offset
}

function clamp01(v: number): number {
  if (v <= 0) return 0
  if (v >= 1) return 1
  return v
}
