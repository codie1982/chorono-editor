import type { ChronoScene, Layer, ShapeStyle, ShapeFill, ObjectFit, ShapeKind, ShapeParams, BezierPath, PathAnchor } from './types'
import { buildPathOnCanvas } from './geometry/PathCommand'
import { splineToPathDefinition } from './spline/splineToPath'
import { computeSplineBounds } from './spline/geometry/computeSplineBounds'
import { trimSplinePath } from './spline/render/trimSplinePath'
import { hitTestSplineFill, hitTestSplineSegment } from './spline/geometry/hitTest'
import { resolveLayerWorldMatrix } from './geometry/resolveLayerWorldMatrix'
import { createLayerWorldBoundsResolver } from './geometry/resolveLayerWorldBounds'
import { buildEffectsFilter } from './types'
import { evaluateTimelines, getLayerValue, type OverrideMap } from './evaluator'
import { evaluateMotionPath } from './motionPath'
import { drawPathStrokeLayer } from './runtime/pathStrokeRenderer'
import { resolveInstanceLayer } from './clone/InstanceResolver'
import {
  resolveTextContent, getStringParamBinding,
  type ParamValueMap,
} from './runtime/paramResolver'
import { hitTestSegment as hitTestSegmentLocal } from './path/pathOps'
import { measureTextLayout } from './text/measureText'
import { buildShapePath, computeShapeLength } from './render/shapeRenderer'
import { buildGradient } from './render/buildGradient'
import { resolveRenderColor } from './render/materializeOverrides'

/** Element cache passed in from React (image / video DOM elements keyed by Asset.id). */
export type AssetElementMap = Map<string, HTMLImageElement | HTMLVideoElement>

// ── Colour helpers ────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').padEnd(6, '0')
  const n = parseInt(clean, 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

// ── Gradient builder ──────────────────────────────────────────────────────────

function buildCanvasGradient(
  ctx: CanvasRenderingContext2D,
  fill: ShapeFill,
  w: number, h: number,
): CanvasGradient | null {
  return buildGradient(ctx, fill.gradient, w, h)
}

// ── Shape renderer ────────────────────────────────────────────────────────────
// Builds the path once, applies optional fill then optional stroke.

export function drawShape(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  overrides: ReturnType<typeof evaluateTimelines>,
  paramValues?: ParamValueMap,
) {
  const w = layer.size?.width  ?? 0
  const h = layer.size?.height ?? 0
  const style: ShapeStyle = layer.style ?? {}
  const cornerRadius = getLayerValue(overrides, layer.id, 'style.cornerRadius', style.cornerRadius ?? 0)

  // Resolve effective shape kind (new shapeKind preferred, legacy shape as fallback)
  const effectiveShape: ShapeKind | 'rect' | 'circle' =
    (layer.shapeKind ?? layer.shape ?? 'rect') as ShapeKind | 'rect' | 'circle'

  // Resolve animated shape params from overrides — keyframes on shapeParams.sides etc.
  const baseParams = layer.shapeParams ?? ({ kind: effectiveShape as ShapeKind })
  const resolvedParams: ShapeParams = {
    ...baseParams,
    sides:       getLayerValue(overrides, layer.id, 'shapeParams.sides',       baseParams.sides       ?? NaN),
    innerRadius: getLayerValue(overrides, layer.id, 'shapeParams.innerRadius', baseParams.innerRadius ?? NaN),
    outerRadius: getLayerValue(overrides, layer.id, 'shapeParams.outerRadius', baseParams.outerRadius ?? NaN),
    roundness:   getLayerValue(overrides, layer.id, 'shapeParams.roundness',   baseParams.roundness   ?? NaN),
    startAngle:  getLayerValue(overrides, layer.id, 'shapeParams.startAngle',  baseParams.startAngle  ?? NaN),
    endAngle:    getLayerValue(overrides, layer.id, 'shapeParams.endAngle',    baseParams.endAngle    ?? NaN),
  }
  // Strip NaN so defaults inside buildShapePath() kick in
  ;(['sides', 'innerRadius', 'outerRadius', 'roundness', 'startAngle', 'endAngle'] as const).forEach(k => {
    if (Number.isNaN(resolvedParams[k] as number)) delete (resolvedParams as any)[k]
  })

  buildShapePath(ctx, effectiveShape, w, h, cornerRadius, resolvedParams)

  // ── Fill (optional) ──────────────────────────────────────────────────────
  if (style.fill) {
    const fillOpacity = getLayerValue(overrides, layer.id, 'style.fill.opacity', style.fill.opacity ?? 100)
    ctx.save()
    ctx.globalAlpha *= fillOpacity / 100

    const gradient = buildCanvasGradient(ctx, style.fill, w, h)
    if (gradient) {
      ctx.fillStyle = gradient
    } else {
      // Priority: paramBinding (string color) → numeric wire override → static
      const boundFill = paramValues ? getStringParamBinding(layer, 'style.fill.color', paramValues) : undefined
      if (boundFill) {
        ctx.fillStyle = boundFill
      } else {
        ctx.fillStyle = resolveRenderColor(overrides, layer.id, 'style.fill.color', style.fill.color ?? '#000000')
      }
    }
    ctx.fill()
    ctx.restore()
  }

  // ── Inner grid (clipped to the shape path, drawn over the fill) ─────────
  if (layer.internalGrid && layer.internalGrid.size > 0 && w > 0 && h > 0) {
    ctx.save()
    ctx.clip()             // current path = shape silhouette
    drawInnerGrid(ctx, w, h, layer.internalGrid.size)
    ctx.restore()
    // Rebuild the path so the stroke below still has it
    buildShapePath(ctx, effectiveShape, w, h, cornerRadius, resolvedParams)
  }

  // ── Stroke (optional) ────────────────────────────────────────────────────
  if (style.stroke) {
    const sw = getLayerValue(overrides, layer.id, 'style.stroke.width',   style.stroke.width)
    const so = getLayerValue(overrides, layer.id, 'style.stroke.opacity', style.stroke.opacity ?? 100)
    const { color: staticStrokeColor, alignment = 'center', dashArray = [], lineCap = 'butt', lineJoin = 'miter' } = style.stroke
    const boundStroke = paramValues ? getStringParamBinding(layer, 'style.stroke.color', paramValues) : undefined
    const color = boundStroke ?? resolveRenderColor(overrides, layer.id, 'style.stroke.color', staticStrokeColor ?? '#FFFFFF')

    // ── Trim Path resolution ──────────────────────────────────────────────
    // If stroke.trim is defined (even with defaults), evaluate animated values
    // and use ctx.setLineDash + lineDashOffset to clip the visible segment.
    let lineDash: number[] = dashArray
    let lineDashOffset = 0

    if (style.stroke.trim || ['start', 'end', 'offset'].some(key => overrides.has(`layers.${layer.id}.style.stroke.trim.${key}`))) {
      const trimStart  = getLayerValue(overrides, layer.id, 'style.stroke.trim.start',  style.stroke.trim?.start  ?? 0)
      const trimEnd    = getLayerValue(overrides, layer.id, 'style.stroke.trim.end',    style.stroke.trim?.end    ?? 1)
      const trimOffset = getLayerValue(overrides, layer.id, 'style.stroke.trim.offset', style.stroke.trim?.offset ?? 0)

      const totalLen   = computeShapeLength(effectiveShape, w, h, resolvedParams)
      if (totalLen > 0) {
        const s = Math.max(0, Math.min(1, trimStart))
        const e = Math.max(0, Math.min(1, trimEnd))
        const visibleFraction = Math.max(0, e - s)
        const visibleLen      = visibleFraction * totalLen
        const gapLen          = totalLen - visibleLen
        lineDash       = visibleFraction <= 0
          ? [0, totalLen]       // nothing visible
          : [visibleLen, gapLen]
        // Negative offset advances the dash window along the path.
        lineDashOffset = -(s * totalLen + trimOffset * totalLen)
      }
    }

    ctx.save()
    ctx.globalAlpha *= so / 100
    // Stroke can be solid colour OR a gradient. Reuse the fill gradient
    // builder — same math (linear angle / radial from centre).
    const strokeStyle: string | CanvasGradient = style.stroke.gradient
      ? (buildCanvasGradient(ctx, { type: 'gradient', gradient: style.stroke.gradient } as any, w, h) ?? color)
      : color
    ctx.strokeStyle    = strokeStyle
    ctx.lineWidth      = sw
    ctx.lineCap        = lineCap
    ctx.lineJoin       = lineJoin
    ctx.setLineDash(lineDash)
    ctx.lineDashOffset = lineDashOffset

    if (alignment === 'inside') {
      // Clip to path; double width so outer half is cut off
      ctx.save()
      ctx.clip()
      ctx.lineWidth = sw * 2
      ctx.stroke()
      ctx.restore()
    } else if (alignment === 'outside') {
      // Draw behind fill via destination-over so the inner half is hidden by fill
      ctx.save()
      ctx.globalCompositeOperation = 'destination-over'
      ctx.lineWidth = sw * 2
      ctx.stroke()
      ctx.restore()
    } else {
      ctx.stroke()
    }

    ctx.setLineDash([])
    ctx.lineDashOffset = 0
    ctx.restore()
  }
}

// ── Bezier path builder & renderer ────────────────────────────────────────────

/**
 * Builds a Path2D-compatible context path from a BezierPath structure.
 * Uses bezierCurveTo for segments where either anchor has out/in handles set,
 * lineTo for straight segments (no handles).
 */
export function buildBezierPath(ctx: CanvasRenderingContext2D, path: BezierPath) {
  const { anchors, closed } = path
  if (anchors.length === 0) return
  ctx.beginPath()
  ctx.moveTo(anchors[0].x, anchors[0].y)

  const segmentCount = closed ? anchors.length : anchors.length - 1
  for (let i = 0; i < segmentCount; i++) {
    const a = anchors[i]
    const b = anchors[(i + 1) % anchors.length]
    const hasOut = a.outX !== undefined && a.outY !== undefined
    const hasIn  = b.inX  !== undefined && b.inY  !== undefined
    if (hasOut || hasIn) {
      const c1x = hasOut ? a.outX! : a.x
      const c1y = hasOut ? a.outY! : a.y
      const c2x = hasIn  ? b.inX!  : b.x
      const c2y = hasIn  ? b.inY!  : b.y
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, b.x, b.y)
    } else {
      ctx.lineTo(b.x, b.y)
    }
  }
  if (closed) ctx.closePath()
}

export function drawBezierPath(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  overrides: ReturnType<typeof evaluateTimelines>,
  paramValues?: ParamValueMap,
) {
  if (!layer.path) return
  const style: ShapeStyle = layer.style ?? {}

  // Compute path bounds — used for gradient sizing (stroke gradients need
  // to know the path's extent, since paths don't carry their own size.)
  const bb = bezierPathBounds(layer.path)
  const w = bb.width
  const h = bb.height

  buildBezierPath(ctx, layer.path)

  // ── Fill ──
  if (style.fill && layer.path.closed) {
    const fillOpacity = getLayerValue(overrides, layer.id, 'style.fill.opacity', style.fill.opacity ?? 100)
    ctx.save()
    ctx.globalAlpha *= fillOpacity / 100
    const boundFill = paramValues ? getStringParamBinding(layer, 'style.fill.color', paramValues) : undefined
    ctx.fillStyle = buildGradient(ctx, style.fill.gradient, w, h, bb.x, bb.y)
      ?? boundFill ?? resolveRenderColor(overrides, layer.id, 'style.fill.color', style.fill.color ?? '#3B82F6')
    ctx.fill()
    ctx.restore()
  }

  // ── Stroke (with trim support) ──
  if (style.stroke) {
    const sw = getLayerValue(overrides, layer.id, 'style.stroke.width',   style.stroke.width)
    if (sw <= 0) return
    const so = getLayerValue(overrides, layer.id, 'style.stroke.opacity', style.stroke.opacity ?? 100)
    const { color: staticStrokeColor, dashArray = [], lineCap = 'butt', lineJoin = 'miter' } = style.stroke
    const boundStroke = paramValues ? getStringParamBinding(layer, 'style.stroke.color', paramValues) : undefined
    const color = boundStroke ?? resolveRenderColor(overrides, layer.id, 'style.stroke.color', staticStrokeColor ?? '#FFFFFF')

    let lineDash       = dashArray
    let lineDashOffset = 0

    if (style.stroke.trim || ['start', 'end', 'offset'].some(key => overrides.has(`layers.${layer.id}.style.stroke.trim.${key}`))) {
      const trimStart  = getLayerValue(overrides, layer.id, 'style.stroke.trim.start',  style.stroke.trim?.start  ?? 0)
      const trimEnd    = getLayerValue(overrides, layer.id, 'style.stroke.trim.end',    style.stroke.trim?.end    ?? 1)
      const trimOffset = getLayerValue(overrides, layer.id, 'style.stroke.trim.offset', style.stroke.trim?.offset ?? 0)
      const totalLen   = bezierPathLength(layer.path)
      if (totalLen > 0) {
        const s = Math.max(0, Math.min(1, trimStart))
        const e = Math.max(0, Math.min(1, trimEnd))
        const visibleFraction = Math.max(0, e - s)
        const visibleLen      = visibleFraction * totalLen
        const gapLen          = totalLen - visibleLen
        lineDash = visibleFraction <= 0 ? [0, totalLen] : [visibleLen, gapLen]
        lineDashOffset = -(s * totalLen + trimOffset * totalLen)
      }
    }

    ctx.save()
    ctx.globalAlpha *= so / 100
    // Stroke can be solid colour OR a gradient. Reuse the fill gradient
    // builder — same math (linear angle / radial from centre).
    const strokeStyle: string | CanvasGradient = style.stroke.gradient
      ? (buildCanvasGradient(ctx, { type: 'gradient', gradient: style.stroke.gradient } as any, w, h) ?? color)
      : color
    ctx.strokeStyle    = strokeStyle
    ctx.lineWidth      = sw
    ctx.lineCap        = lineCap
    ctx.lineJoin       = lineJoin
    ctx.setLineDash(lineDash)
    ctx.lineDashOffset = lineDashOffset
    ctx.stroke()
    ctx.setLineDash([])
    ctx.lineDashOffset = 0
    ctx.restore()
  }
}

// ── Spline Layer ─────────────────────────────────────────────────────────────

/**
 * Renders a `type: 'spline'` layer. Converts all SubShape contours to a single
 * compound PathDefinition, then applies fill (with fillRule) and stroke.
 */
export function drawSplineLayer(
  ctx:         CanvasRenderingContext2D,
  layer:       Layer,
  overrides:   ReturnType<typeof evaluateTimelines>,
  paramValues?: ParamValueMap,
) {
  if (!layer.spline) return
  const style: ShapeStyle = layer.style ?? {}
  const pathDef  = splineToPathDefinition(layer.spline)
  const fillRule = layer.spline.fillRule === 'evenodd' ? 'evenodd' as const : 'nonzero' as const
  const bounds = computeSplineBounds(layer.spline)
  const resolveColor = (property: string, fallback: string): string => {
    const bound = paramValues ? getStringParamBinding(layer, property, paramValues) : undefined
    if (bound) return bound
    return resolveRenderColor(overrides, layer.id, property, fallback)
  }

  // Only fill closed paths — open paths (arcs, lines) are stroke-only
  if (style.fill && pathDef.closed) {
    // A compound spline can contain closed shapes AND open arcs. Canvas fill
    // implicitly closes open subpaths, so keep them out of the fill pass.
    buildPathOnCanvas(ctx, splineToPathDefinition(layer.spline, { closedOnly: true }))
    const fillOpacity = getLayerValue(overrides, layer.id, 'style.fill.opacity', style.fill.opacity ?? 100)
    ctx.save()
    ctx.globalAlpha *= fillOpacity / 100
    ctx.fillStyle = (style.fill.type === 'gradient'
      ? buildGradient(ctx, style.fill.gradient, bounds.width, bounds.height, bounds.x, bounds.y)
      : null) ?? resolveColor('style.fill.color', style.fill.color ?? '#3B82F6')
    ctx.fill(fillRule)
    ctx.restore()
  }

  if (style.stroke) {
    const sw = getLayerValue(overrides, layer.id, 'style.stroke.width',   style.stroke.width)
    // A default closed spline has width 0; its width can still be animated.
    if (sw <= 0) return
    const so = getLayerValue(overrides, layer.id, 'style.stroke.opacity', style.stroke.opacity ?? 100)
    const { color = '#FFFFFF', dashArray = [], lineCap = 'butt', lineJoin = 'miter' } = style.stroke
    const trim = style.stroke.trim
    const hasTrim = !!trim || ['start', 'end', 'offset'].some(key =>
      overrides.has(`layers.${layer.id}.style.stroke.trim.${key}`))
    const strokePath = hasTrim ? trimSplinePath(
      pathDef,
      getLayerValue(overrides, layer.id, 'style.stroke.trim.start', trim?.start ?? 0),
      getLayerValue(overrides, layer.id, 'style.stroke.trim.end', trim?.end ?? 1),
      getLayerValue(overrides, layer.id, 'style.stroke.trim.offset', trim?.offset ?? 0),
    ) : pathDef
    if (strokePath.commands.length === 0) return
    buildPathOnCanvas(ctx, strokePath)
    ctx.save()
    ctx.globalAlpha   *= so / 100
    ctx.strokeStyle = buildGradient(ctx, style.stroke.gradient, bounds.width, bounds.height, bounds.x, bounds.y)
      ?? resolveColor('style.stroke.color', color)
    ctx.lineWidth      = sw
    ctx.lineCap        = lineCap
    ctx.lineJoin       = lineJoin
    ctx.setLineDash(dashArray)
    ctx.lineDashOffset = 0
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }
}

/**
 * Approximate total length of a Bezier path by sampling each segment with N
 * points and summing the straight-line distances. N=32 is a good
 * speed/accuracy trade for editor-time work.
 */
export function bezierPathLength(path: BezierPath, samplesPerSegment = 32): number {
  const { anchors, closed } = path
  if (anchors.length < 2) return 0
  let total = 0
  const segments = closed ? anchors.length : anchors.length - 1
  for (let i = 0; i < segments; i++) {
    const a = anchors[i]
    const b = anchors[(i + 1) % anchors.length]
    total += segmentLength(a, b, samplesPerSegment)
  }
  return total
}

function segmentLength(a: PathAnchor, b: PathAnchor, samples: number): number {
  const hasOut = a.outX !== undefined && a.outY !== undefined
  const hasIn  = b.inX  !== undefined && b.inY  !== undefined
  if (!hasOut && !hasIn) {
    return Math.hypot(b.x - a.x, b.y - a.y)
  }
  const c1x = hasOut ? a.outX! : a.x
  const c1y = hasOut ? a.outY! : a.y
  const c2x = hasIn  ? b.inX!  : b.x
  const c2y = hasIn  ? b.inY!  : b.y
  let prevX = a.x, prevY = a.y
  let len = 0
  for (let i = 1; i <= samples; i++) {
    const t = i / samples
    const it = 1 - t
    const x = it * it * it * a.x + 3 * it * it * t * c1x + 3 * it * t * t * c2x + t * t * t * b.x
    const y = it * it * it * a.y + 3 * it * it * t * c1y + 3 * it * t * t * c2y + t * t * t * b.y
    len += Math.hypot(x - prevX, y - prevY)
    prevX = x; prevY = y
  }
  return len
}

/** Axis-aligned bounding box of a Bezier path (anchor-only — handles ignored for simplicity). */
export function bezierPathBounds(path: BezierPath): { x: number; y: number; width: number; height: number } {
  if (path.anchors.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const a of path.anchors) {
    if (a.x < minX) minX = a.x
    if (a.y < minY) minY = a.y
    if (a.x > maxX) maxX = a.x
    if (a.y > maxY) maxY = a.y
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

// ── Image renderer ────────────────────────────────────────────────────────────

/**
 * Draw an image/video element into the (w, h) box using the given objectFit.
 * Pure pixel math — no DOM access beyond passed-in element.
 */
function drawFitted(
  ctx: CanvasRenderingContext2D,
  el: HTMLImageElement | HTMLVideoElement,
  w: number, h: number,
  fit: ObjectFit,
) {
  const srcW = el instanceof HTMLImageElement ? el.naturalWidth  : el.videoWidth
  const srcH = el instanceof HTMLImageElement ? el.naturalHeight : el.videoHeight
  if (srcW === 0 || srcH === 0 || w === 0 || h === 0) return

  if (fit === 'fill') {
    ctx.drawImage(el, 0, 0, w, h)
    return
  }
  if (fit === 'none') {
    ctx.drawImage(el, 0, 0, srcW, srcH)
    return
  }

  // contain / cover share aspect-fit math
  const scale = fit === 'cover'
    ? Math.max(w / srcW, h / srcH)
    : Math.min(w / srcW, h / srcH)
  const dw = srcW * scale
  const dh = srcH * scale
  const dx = (w - dw) / 2
  const dy = (h - dh) / 2

  if (fit === 'cover') {
    // Clip to box so overflow is hidden
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, w, h)
    ctx.clip()
    ctx.drawImage(el, dx, dy, dw, dh)
    ctx.restore()
  } else {
    ctx.drawImage(el, dx, dy, dw, dh)
  }
}

export function drawImageLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  assets: AssetElementMap,
) {
  if (!layer.image || !layer.size) return
  const el = assets.get(layer.image.assetId)
  if (!el) return  // not loaded yet — skip silently
  drawFitted(ctx, el, layer.size.width, layer.size.height, layer.image.objectFit ?? 'contain')
}

export function drawVideoLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  assets: AssetElementMap,
) {
  if (!layer.video || !layer.size) return
  const el = assets.get(layer.video.assetId)
  if (!el || !(el instanceof HTMLVideoElement)) return
  // Use 'cover' for video by default so it fills the layer box
  drawFitted(ctx, el, layer.size.width, layer.size.height, 'cover')
}

// ── Text renderer ─────────────────────────────────────────────────────────────

export function drawText(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  paramValues?: ParamValueMap,
  overrides?: ReturnType<typeof evaluateTimelines>,
) {
  if (!layer.text) return
  const {
    value, color, gradient,
    fontFamily = 'sans-serif', fontWeight = 'normal', fontStyle = 'normal',
    textAlign = 'left', lineHeight: _lh,
    stroke, shadow, uppercase, underline,
  } = layer.text
  // text.fontSize can be driven by a paramBinding or keyframe override.
  const fontSize = overrides
    ? getLayerValue(overrides, layer.id, 'text.fontSize', layer.text.fontSize)
    : layer.text.fontSize
  const letterSpacing = overrides
    ? getLayerValue(overrides, layer.id, 'text.letterSpacing', layer.text.letterSpacing ?? 0)
    : layer.text.letterSpacing ?? 0

  // Runtime parameter resolution:
  //   1. paramBindings['text.value'] → entire text replaced by parameter value
  //   2. {paramId} placeholders inside (raw or bound) text → substituted
  const boundText = paramValues ? getStringParamBinding(layer, 'text.value', paramValues) : undefined
  const animatedText = overrides?.get(`layers.${layer.id}.text.value`)
  const rawText = boundText ?? (typeof animatedText === 'string' ? animatedText : value)
  const resolvedValue = paramValues ? resolveTextContent(rawText, paramValues) : rawText
  const displayText = uppercase ? resolvedValue.toUpperCase() : resolvedValue
  // Parameter-bound colour override (paramBindings['text.color']).
  const resolvedColor = paramValues
    ? (getStringParamBinding(layer, 'text.color', paramValues)
      ?? (overrides ? resolveRenderColor(overrides, layer.id, 'text.color', color) : color))
    : overrides ? resolveRenderColor(overrides, layer.id, 'text.color', color) : color
  ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`
  ctx.textAlign    = textAlign as CanvasTextAlign
  ctx.textBaseline = 'top'

  // Shadow
  if (shadow) {
    ctx.shadowOffsetX = shadow.x
    ctx.shadowOffsetY = shadow.y
    ctx.shadowBlur    = shadow.blur
    ctx.shadowColor   = shadow.color
  }

  const drawRun = (method: 'fill' | 'stroke') => {
    if (letterSpacing === 0) {
      if (method === 'fill') ctx.fillText(displayText, 0, 0)
      else                   ctx.strokeText(displayText, 0, 0)
      return
    }
    let cursor = 0
    Array.from(displayText).forEach((char) => {
      if (method === 'fill') ctx.fillText(char, cursor, 0)
      else                   ctx.strokeText(char, cursor, 0)
      cursor += ctx.measureText(char).width + letterSpacing
    })
  }

  // Text outline — must come BEFORE fill so fill covers the inner half
  if (stroke) {
    ctx.strokeStyle = stroke.color
    ctx.lineWidth   = stroke.width * 2
    ctx.lineJoin    = 'round'
    drawRun('stroke')
  }

  // Gradient fill spans the measured text bounds (offset by textAlign so it
  // tracks where the glyphs actually land). Falls back to the solid colour.
  let textFill: string | CanvasGradient = resolvedColor
  if (gradient && gradient.stops?.length >= 2) {
    const textWidth = letterSpacing === 0
      ? ctx.measureText(displayText).width
      : Array.from(displayText).reduce((w, c) => w + ctx.measureText(c).width + letterSpacing, 0)
    const left = textAlign === 'center' ? -textWidth / 2
      : textAlign === 'right' ? -textWidth
      : 0
    const g = buildGradient(ctx, gradient, textWidth, fontSize, left, 0)
    if (g) textFill = g
  }
  ctx.fillStyle = textFill
  drawRun('fill')

  // Reset shadow so it doesn't bleed into the next layer
  if (shadow) ctx.shadowColor = 'transparent'

  // Manual underline (Canvas has no text-decoration API)
  if (underline) {
    const totalWidth = letterSpacing === 0
      ? ctx.measureText(displayText).width
      : Array.from(displayText).reduce((w, c) => w + ctx.measureText(c).width + letterSpacing, 0)
    ctx.fillRect(0, fontSize * 1.15, totalWidth, Math.max(1, fontSize / 15))
  }
}

// ── Layer renderer ────────────────────────────────────────────────────────────

function renderLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  overrides: ReturnType<typeof evaluateTimelines>,
  isSelected: boolean,
  assets: AssetElementMap,
  paramValues?: ParamValueMap,
) {
  if (layer.hidden) return

  let x      = getLayerValue(overrides, layer.id, 'transform.x',           layer.transform.x)
  let y      = getLayerValue(overrides, layer.id, 'transform.y',           layer.transform.y)
  const scaleX = getLayerValue(overrides, layer.id, 'transform.scaleX',      layer.transform.scaleX)
  const scaleY = getLayerValue(overrides, layer.id, 'transform.scaleY',      layer.transform.scaleY)
  let rot    = getLayerValue(overrides, layer.id, 'transform.rotationDeg', layer.transform.rotationDeg)
  const opacity = getLayerValue(overrides, layer.id, 'opacity',               layer.opacity)

  // ── Motion path: override position (and optionally rotation) ────────────
  if (layer.motionPath) {
    const offset = getLayerValue(overrides, layer.id, 'motionPath.offset', 0)
    const pt = evaluateMotionPath(layer.motionPath.pathData, offset)
    if (pt) {
      x = pt.x
      y = pt.y
      if (layer.motionPath.autoRotate) rot = pt.rotationDeg
    }
  }

  ctx.save()
  ctx.globalAlpha               *= Math.max(0, Math.min(1, opacity))
  ctx.globalCompositeOperation   = (layer.blendMode as GlobalCompositeOperation) ?? 'source-over'
  ctx.filter                     = buildEffectsFilter(layer.effects)

  const anchorX = getLayerValue(overrides, layer.id, 'transform.anchorX', layer.transform.anchorX)
  const anchorY = getLayerValue(overrides, layer.id, 'transform.anchorY', layer.transform.anchorY)
  ctx.translate(x + anchorX, y + anchorY)
  if (rot   !== 0)           ctx.rotate((rot * Math.PI) / 180)
  if (scaleX !== 1 || scaleY !== 1) ctx.scale(scaleX, scaleY)
  ctx.translate(-anchorX, -anchorY)

  // ── Draw by type ───────────────────────────────────────────────────────
  // NOTE: Sprint 5.0.8 — dispatch logic is being migrated to
  // LayerRendererRegistry but renderer.ts can't import the registry without
  // creating a circular dependency (registry/bootstrap → renderers/index →
  // renderer.ts). The CanvasRenderer module (5.0.10) will replace this whole
  // block using the registry. Until then, the legacy switch stays.
  if (layer.type === 'shape' && layer.size) {
    drawShape(ctx, layer, overrides, paramValues)
  } else if (layer.type === 'text') {
    drawText(ctx, layer, paramValues, overrides)
  } else if (layer.type === 'image') {
    drawImageLayer(ctx, layer, assets)
  } else if (layer.type === 'video') {
    drawVideoLayer(ctx, layer, assets)
  } else if (layer.type === 'pathStroke') {
    drawPathStrokeLayer(ctx, layer, overrides)
  } else if (layer.type === 'path' && layer.path) {
    drawBezierPath(ctx, layer, overrides, paramValues)
  }
  // audio: no canvas rendering (handled by an AudioEngine)

  // ── Selection outline ─────────────────────────────────────────────────
  if (isSelected) {
    ctx.filter      = 'none'
    ctx.strokeStyle = '#60A5FA'
    ctx.lineWidth   = 1.5 / ((scaleX + scaleY) / 2)

    // For path layers, also overlay the anchor + handle markers (Pen Tool UI)
    if (layer.type === 'path' && layer.path) {
      drawPathOverlay(ctx, layer.path, (scaleX + scaleY) / 2)
    } else {
      // BL-72: text layers carry a measured `size`; legacy ones (old saved
      // scenes) may not — measure on the fly so the outline still wraps glyphs.
      const box = layer.size ?? (layer.text ? measureTextLayout(layer.text) : undefined)
      const w = box?.width  ?? 0
      const h = box?.height ?? (layer.text?.fontSize ?? 20)
      ctx.setLineDash([4, 3])
      ctx.strokeRect(-2, -2, w + 4, h + 4)
      ctx.setLineDash([])
    }
  }

  ctx.restore()
}

/**
 * Renders Pen-Tool anchor and handle markers on top of the selected path layer.
 * `displayScale` lets us keep markers a constant on-screen size regardless of
 * the layer's scale transform.
 */
function drawPathOverlay(
  ctx: CanvasRenderingContext2D,
  path: BezierPath,
  displayScale: number,
) {
  const k = 1 / Math.max(0.01, displayScale)  // counter-scale factor for markers
  const anchorSize = 4 * k
  const handleSize = 3 * k
  const lineWidth  = 1 * k

  // Handle stems
  ctx.save()
  ctx.strokeStyle = '#60A5FA'
  ctx.lineWidth   = lineWidth
  ctx.setLineDash([])
  for (const a of path.anchors) {
    if (a.inX !== undefined && a.inY !== undefined) {
      ctx.beginPath()
      ctx.moveTo(a.x, a.y); ctx.lineTo(a.inX, a.inY); ctx.stroke()
    }
    if (a.outX !== undefined && a.outY !== undefined) {
      ctx.beginPath()
      ctx.moveTo(a.x, a.y); ctx.lineTo(a.outX, a.outY); ctx.stroke()
    }
  }
  ctx.restore()

  // Handle dots (round)
  ctx.save()
  ctx.fillStyle   = '#1f2937'
  ctx.strokeStyle = '#60A5FA'
  ctx.lineWidth   = lineWidth
  for (const a of path.anchors) {
    if (a.inX !== undefined && a.inY !== undefined) {
      ctx.beginPath()
      ctx.arc(a.inX, a.inY, handleSize, 0, Math.PI * 2)
      ctx.fill(); ctx.stroke()
    }
    if (a.outX !== undefined && a.outY !== undefined) {
      ctx.beginPath()
      ctx.arc(a.outX, a.outY, handleSize, 0, Math.PI * 2)
      ctx.fill(); ctx.stroke()
    }
  }
  ctx.restore()

  // Anchor squares (colour by point type — corner: white, smooth: blue, mirror: orange)
  ctx.save()
  ctx.lineWidth = lineWidth
  ctx.strokeStyle = '#1d4ed8'
  for (const a of path.anchors) {
    ctx.fillStyle =
        a.pointType === 'mirror' ? '#F59E0B'
      : a.pointType === 'smooth' ? '#60A5FA'
      : '#FFFFFF'
    ctx.fillRect(a.x - anchorSize, a.y - anchorSize, anchorSize * 2, anchorSize * 2)
    ctx.strokeRect(a.x - anchorSize, a.y - anchorSize, anchorSize * 2, anchorSize * 2)
  }
  ctx.restore()
}

// ── Main render function ──────────────────────────────────────────────────────

export interface GridOptions {
  /** Step between grid lines, in composition pixels. */
  size: number
}

export interface RenderOptions {
  grid?:        GridOptions
  /** Optional pre-computed override map (e.g. from the interactive runtime
   *  hook including param + binding overrides). When omitted, evaluator
   *  output is used directly. */
  overrides?:   OverrideMap
  /** Runtime parameter values for text placeholder + colour resolution. */
  paramValues?: ParamValueMap
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  scene: ChronoScene,
  timeMs: number,
  selectedLayerId: string | null,
  assets: AssetElementMap = new Map(),
  gridOrOptions?: GridOptions | RenderOptions,
) {
  // Backward-compatible signature: 6th arg may be GridOptions OR RenderOptions.
  const opts: RenderOptions =
    gridOrOptions && 'grid' in gridOrOptions
      ? gridOrOptions
      : gridOrOptions
        ? { grid: gridOrOptions as GridOptions }
        : {}
  const grid = opts.grid

  const { width, height, backgroundColor } = scene.composition
  const overrides = opts.overrides ?? evaluateTimelines(scene.timelines, timeMs)

  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = backgroundColor
  ctx.fillRect(0, 0, width, height)

  // If any layer is solo'd, only render solo layers.
  const anySolo = scene.layers.some((l) => l.type !== 'audio' && l.solo)

  for (const layer of scene.layers) {
    if (anySolo && !layer.solo) continue
    renderLayer(ctx, layer, overrides, layer.id === selectedLayerId, assets, opts.paramValues)
  }

  // Canvas grid drawn ON TOP of layers so it stays visible even when a
  // background layer covers the artboard. Uses a neutral grey so it reads
  // on both light and dark backgrounds.
  if (grid && grid.size > 0) drawGrid(ctx, width, height, grid.size)

  // Time watermark
  ctx.save()
  ctx.globalAlpha = 0.5
  ctx.fillStyle   = '#94A3B8'
  ctx.font        = '9px monospace'
  ctx.fillText(`${Math.round(timeMs)}ms`, 4, height - 4)
  ctx.restore()
}

// ── Canvas grid (drawn on TOP of layers — guaranteed visible) ───────────────
// Neutral mid-grey + moderate alpha → readable on both light and dark
// backgrounds and through opaque-fill background layers.

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, step: number) {
  if (step <= 0) return
  ctx.save()
  ctx.lineWidth = 1
  for (let i = 0, x = 0; x <= w; x += step, i++) {
    ctx.strokeStyle = i % 5 === 0 ? 'rgba(150,150,150,0.45)' : 'rgba(150,150,150,0.22)'
    ctx.beginPath()
    ctx.moveTo(x + 0.5, 0)
    ctx.lineTo(x + 0.5, h)
    ctx.stroke()
  }
  for (let i = 0, y = 0; y <= h; y += step, i++) {
    ctx.strokeStyle = i % 5 === 0 ? 'rgba(150,150,150,0.45)' : 'rgba(150,150,150,0.22)'
    ctx.beginPath()
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(w, y + 0.5)
    ctx.stroke()
  }
  ctx.restore()
}

// ── Inner (layer-local) grid drawn inside a shape's local bounds ──────────────

function drawInnerGrid(ctx: CanvasRenderingContext2D, w: number, h: number, step: number) {
  if (step <= 0) return
  ctx.save()
  ctx.lineWidth = 1
  for (let i = 0, x = 0; x <= w; x += step, i++) {
    ctx.strokeStyle = i % 5 === 0 ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.18)'
    ctx.beginPath()
    ctx.moveTo(x + 0.5, 0)
    ctx.lineTo(x + 0.5, h)
    ctx.stroke()
  }
  for (let i = 0, y = 0; y <= h; y += step, i++) {
    ctx.strokeStyle = i % 5 === 0 ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.18)'
    ctx.beginPath()
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(w, y + 0.5)
    ctx.stroke()
  }
  ctx.restore()
}

// ── Hit test ──────────────────────────────────────────────────────────────────

export function hitTestLayer(
  scene: ChronoScene,
  timeMs: number,
  canvasX: number,
  canvasY: number,
  overrides?: OverrideMap,
): string | null {
  return hitTestLayersAt(scene, timeMs, canvasX, canvasY, overrides)[0] ?? null
}

/**
 * Returns ALL layer ids whose body contains the point, ordered top of
 * stack → bottom. Shape-aware: lines / arrows use point-to-segment distance,
 * rings / arcs use radial test, rest fall back to AABB.
 */
export function hitTestLayersAt(
  scene: ChronoScene,
  timeMs: number,
  canvasX: number,
  canvasY: number,
  frameOverrides?: OverrideMap,
): string[] {
  // Hit-test the same frame the canvas displays (timeline isolation, state
  // machines and parameter bindings may replace the normal timeline values).
  const overrides = frameOverrides ?? evaluateTimelines(scene.timelines, timeMs)
  const hits: string[] = []
  const boundsForFrame = createLayerWorldBoundsResolver(scene, timeMs, overrides)

  for (let i = scene.layers.length - 1; i >= 0; i--) {
    const layer = scene.layers[i]
    if (layer.hidden || layer.locked) continue
    if (layer.frozen) continue   // BL-55 — frozen layers render but aren't selectable
    if (layer.type === 'audio') continue
    if (layer.type === 'group') continue   // groups are tested via children union below

    const matrix = resolveLayerWorldMatrix(layer, scene, timeMs, overrides)
    // A zero scale produces no visible body and cannot be inverted.
    if (Math.abs(matrix.determinant()) < 1e-9) continue
    const { x: lx, y: ly } = matrix.invert().applyToPoint({ x: canvasX, y: canvasY })

    // BL-59 Phase 3 — Instance layers have no geometry of their own;
    // resolve to the source so hit-test uses the source's shape/size.
    let hitLayer: Layer = layer
    if (layer.instanceOf) {
      const resolved = resolveInstanceLayer(layer, scene.layers)
      if (!resolved) continue   // source missing → not hittable
      hitLayer = resolved
    }

    if (hitTestLayerLocal(hitLayer, lx, ly)) hits.push(layer.id)
  }

  // BL-03: Group AABB hit-test. After per-leaf hits are collected, walk
  // group layers and add the group when the click sits inside the union
  // of its children's world bounds. This means clicking the EMPTY area
  // between children of a group still selects the group — matches
  // Figma / 3ds Max behavior.
  for (let i = scene.layers.length - 1; i >= 0; i--) {
    const layer = scene.layers[i]
    if (layer.type !== 'group') continue
    if (layer.hidden || layer.locked || layer.frozen) continue
    const bounds = boundsForFrame(layer)
    if (!bounds) continue
    if (canvasX >= bounds.x && canvasX <= bounds.x + bounds.width &&
        canvasY >= bounds.y && canvasY <= bounds.y + bounds.height) {
      hits.push(layer.id)
    }
  }
  return hits
}

/**
 * Per-layer hit test in LOCAL coordinates (relative to layer.transform.x/y).
 * Returns true if the local point (lx, ly) is on the layer's body or stroke.
 */
function hitTestLayerLocal(layer: Layer, lx: number, ly: number): boolean {
  if (layer.type === 'spline') {
    if (!layer.spline) return false
    // Splines are centred around local origin and have no size box. Pick the
    // actual compound fill/stroke, including holes and negative coordinates.
    const slop = Math.max(6, (layer.style?.stroke?.width ?? 0) / 2 + 4)
    return !!hitTestSplineSegment(layer.spline, lx, ly, slop)
      || (!!layer.style?.fill && hitTestSplineFill(layer.spline, lx, ly))
  }
  // BL-66 — Bezier path layers carry no `size`. Hit-test by proximity to the
  // path's stroke (so empty space around the curve doesn't grab clicks) plus
  // an interior fill check when the path is closed. Empty paths (< 2 anchors)
  // are NOT hittable — they have no visible geometry yet.
  if (layer.type === 'path' && layer.path) {
    if (layer.path.anchors.length < 2) return false
    const slop = Math.max(8, (layer.style?.stroke?.width ?? 2) / 2 + 6)
    const segHit = hitTestSegmentLocal(layer.path, lx, ly, slop)
    if (segHit) return true
    // Closed path with fill → interior hits too (point-in-polygon over the
    // anchor polygon is a good-enough proxy; the curve bulges slightly past
    // it, covered by the stroke slop above).
    if (layer.path.closed) {
      return pointInPolygon(lx, ly, layer.path.anchors)
    }
    return false
  }

  const w = layer.size?.width  ?? 80
  const h = layer.size?.height ?? (layer.text?.fontSize ?? 24)
  const shapeKind = layer.shapeKind ?? layer.shape

  // Hit slop — extra pixels around stroke to make tap targets forgiving
  const strokeWidth = (layer.style?.stroke?.width ?? 0)
  const slop        = Math.max(6, strokeWidth / 2 + 4)

  // ── Line / Arrow — point-to-segment distance ──────────────────────────
  if (shapeKind === 'line' || shapeKind === 'arrow') {
    const x2 = layer.shapeParams?.x2 ?? w
    const y2 = layer.shapeParams?.y2 ?? 0
    return pointToSegmentDistance(lx, ly, 0, 0, x2, y2) <= slop
  }

  // ── Ring — annular (ring-shaped) hit zone ─────────────────────────────
  if (shapeKind === 'ring') {
    const cx = w / 2, cy = h / 2
    const dist   = Math.hypot(lx - cx, ly - cy)
    const outerR = Math.min(w, h) / 2
    const innerR = layer.shapeParams?.innerRadius ?? outerR * 0.6
    if (dist > outerR + slop || dist < innerR - slop) return false
    // Angle sweep check
    const startDeg = layer.shapeParams?.startAngle ?? 0
    const endDeg   = layer.shapeParams?.endAngle   ?? 360
    if (Math.abs(endDeg - startDeg) >= 360 - 0.01) return true
    const a = (Math.atan2(ly - cy, lx - cx) * 180) / Math.PI + 90  // 0 = 12 o'clock
    return inAngleRange(a, startDeg, endDeg)
  }

  // ── Arc — distance-to-circle test inside angle sweep ──────────────────
  if (shapeKind === 'arc') {
    const cx = w / 2, cy = h / 2
    const r  = Math.min(w, h) / 2
    const dist = Math.abs(Math.hypot(lx - cx, ly - cy) - r)
    if (dist > slop) return false
    const startDeg = layer.shapeParams?.startAngle ?? -90
    const endDeg   = layer.shapeParams?.endAngle   ??  90
    // Arc uses standard math angle (0 = 3 o'clock) — match buildShapePath
    const a = (Math.atan2(ly - cy, lx - cx) * 180) / Math.PI
    return inAngleRange(a, startDeg, endDeg)
  }

  // ── Circle / Ellipse — radial test ────────────────────────────────────
  if (shapeKind === 'circle' || shapeKind === 'ellipse') {
    const rx = w / 2, ry = h / 2
    const dx = (lx - rx) / rx, dy = (ly - ry) / ry
    return dx * dx + dy * dy <= 1
  }

  // ── Capsule (rounded pill) ────────────────────────────────────────────
  if (shapeKind === 'capsule') {
    const r = Math.min(w, h) / 2
    // Straight midsection
    if (lx >= r && lx <= w - r) return ly >= 0 && ly <= h
    // Left semicircle
    if (lx < r)         return Math.hypot(lx - r, ly - r) <= r
    return Math.hypot(lx - (w - r), ly - r) <= r
  }

  // ── Default — axis-aligned bounding box ───────────────────────────────
  return lx >= 0 && lx <= w && ly >= 0 && ly <= h
}

// ── Geometry helpers ──────────────────────────────────────────────────────────

function pointToSegmentDistance(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number,
): number {
  const dx = x2 - x1, dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - x1, py - y1)
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

/** Standard ray-cast point-in-polygon test (anchors form the polygon). */
function pointInPolygon(lx: number, ly: number, anchors: PathAnchor[]): boolean {
  let inside = false
  const n = anchors.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = anchors[i].x, yi = anchors[i].y
    const xj = anchors[j].x, yj = anchors[j].y
    const intersect = ((yi > ly) !== (yj > ly))
      && (lx < (xj - xi) * (ly - yi) / ((yj - yi) || 1e-9) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

/** Returns true if the angle `a` (degrees) falls inside the inclusive range [start, end]. */
function inAngleRange(a: number, startDeg: number, endDeg: number): boolean {
  const norm = (d: number) => ((d % 360) + 360) % 360
  const A = norm(a), S = norm(startDeg), E = norm(endDeg)
  return S <= E ? (A >= S && A <= E) : (A >= S || A <= E)
}
