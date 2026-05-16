import type { ChronoScene, Layer, ShapeStyle, ShapeFill, ObjectFit } from './types'
import { buildEffectsFilter } from './types'
import { evaluateTimelines, getLayerValue, type OverrideMap } from './evaluator'
import { evaluateMotionPath } from './motionPath'
import { drawPathStrokeLayer } from './runtime/pathStrokeRenderer'
import {
  resolveTextContent, getStringParamBinding,
  type ParamValueMap,
} from './runtime/paramResolver'

/** Element cache passed in from React (image / video DOM elements keyed by Asset.id). */
export type AssetElementMap = Map<string, HTMLImageElement | HTMLVideoElement>

// ── Colour helpers ────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').padEnd(6, '0')
  const n = parseInt(clean, 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

// ── Shape path builder ────────────────────────────────────────────────────────

function buildShapePath(
  ctx: CanvasRenderingContext2D,
  shape: 'rect' | 'circle',
  w: number, h: number,
  cornerRadius: number,
) {
  if (shape === 'circle') {
    const r = Math.min(w, h) / 2
    ctx.beginPath()
    ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2)
    return
  }

  // Rounded rect
  const r = Math.min(Math.max(0, cornerRadius), w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(r, 0)
  ctx.lineTo(w - r, 0)
  ctx.arcTo(w, 0, w, r, r)
  ctx.lineTo(w, h - r)
  ctx.arcTo(w, h, w - r, h, r)
  ctx.lineTo(r, h)
  ctx.arcTo(0, h, 0, h - r, r)
  ctx.lineTo(0, r)
  ctx.arcTo(0, 0, r, 0, r)
  ctx.closePath()
}

// ── Gradient builder ──────────────────────────────────────────────────────────

function buildCanvasGradient(
  ctx: CanvasRenderingContext2D,
  fill: ShapeFill,
  w: number, h: number,
): CanvasGradient | null {
  const grad = fill.gradient
  if (!grad || grad.stops.length < 2) return null

  let g: CanvasGradient
  if (grad.type === 'linear') {
    const angle = ((grad.angle ?? 0) * Math.PI) / 180
    const cx = w / 2, cy = h / 2
    g = ctx.createLinearGradient(
      cx - Math.cos(angle) * cx, cy - Math.sin(angle) * cy,
      cx + Math.cos(angle) * cx, cy + Math.sin(angle) * cy,
    )
  } else {
    g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) / 2)
  }
  grad.stops.forEach((s) => g.addColorStop(s.offset, s.color))
  return g
}

// ── Shape renderer ────────────────────────────────────────────────────────────
// Builds the path once, applies optional fill then optional stroke.

function drawShape(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  overrides: ReturnType<typeof evaluateTimelines>,
) {
  const w = layer.size?.width  ?? 0
  const h = layer.size?.height ?? 0
  const style: ShapeStyle = layer.style ?? {}
  const cornerRadius = getLayerValue(overrides, layer.id, 'style.cornerRadius', style.cornerRadius ?? 0)

  buildShapePath(ctx, layer.shape ?? 'rect', w, h, cornerRadius)

  // ── Fill (optional) ──────────────────────────────────────────────────────
  if (style.fill) {
    const fillOpacity = getLayerValue(overrides, layer.id, 'style.fill.opacity', style.fill.opacity ?? 100)
    ctx.save()
    ctx.globalAlpha *= fillOpacity / 100

    const gradient = buildCanvasGradient(ctx, style.fill, w, h)
    if (gradient) {
      ctx.fillStyle = gradient
    } else {
      const color = getLayerValue(overrides, layer.id, 'style.fill.color' as string, 0)
      ctx.fillStyle = overrides.has(`layers.${layer.id}.style.fill.color`)
        ? `#${Math.round(color).toString(16).padStart(6, '0')}`
        : (style.fill.color ?? '#000000')
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
    buildShapePath(ctx, layer.shape ?? 'rect', w, h, cornerRadius)
  }

  // ── Stroke (optional) ────────────────────────────────────────────────────
  if (style.stroke) {
    const sw = getLayerValue(overrides, layer.id, 'style.stroke.width',   style.stroke.width)
    const so = getLayerValue(overrides, layer.id, 'style.stroke.opacity', style.stroke.opacity ?? 100)
    const { color, alignment = 'center', dashArray = [], lineCap = 'butt', lineJoin = 'miter' } = style.stroke

    ctx.save()
    ctx.globalAlpha *= so / 100
    ctx.strokeStyle = color
    ctx.lineWidth   = sw
    ctx.lineCap     = lineCap
    ctx.lineJoin    = lineJoin
    ctx.setLineDash(dashArray)

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
    ctx.restore()
  }
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

function drawImageLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  assets: AssetElementMap,
) {
  if (!layer.image || !layer.size) return
  const el = assets.get(layer.image.assetId)
  if (!el) return  // not loaded yet — skip silently
  drawFitted(ctx, el, layer.size.width, layer.size.height, layer.image.objectFit ?? 'contain')
}

function drawVideoLayer(
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

function drawText(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  paramValues?: ParamValueMap,
) {
  if (!layer.text) return
  const {
    value, fontSize, color,
    fontFamily = 'sans-serif', fontWeight = 'normal', fontStyle = 'normal',
    textAlign = 'left', letterSpacing = 0, lineHeight: _lh,
    stroke, shadow, uppercase, underline,
  } = layer.text

  // Runtime parameter resolution — replaces "{paramId}" placeholders.
  const resolvedValue = paramValues ? resolveTextContent(value, paramValues) : value
  const displayText = uppercase ? resolvedValue.toUpperCase() : resolvedValue
  // Parameter-bound colour override (paramBindings['text.color']).
  const resolvedColor = paramValues
    ? (getStringParamBinding(layer, 'text.color', paramValues) ?? color)
    : color
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

  ctx.fillStyle = resolvedColor
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

  const { anchorX, anchorY } = layer.transform
  ctx.translate(x + anchorX, y + anchorY)
  if (rot   !== 0)           ctx.rotate((rot * Math.PI) / 180)
  if (scaleX !== 1 || scaleY !== 1) ctx.scale(scaleX, scaleY)
  ctx.translate(-anchorX, -anchorY)

  // ── Draw by type ───────────────────────────────────────────────────────
  if (layer.type === 'shape' && layer.size) {
    drawShape(ctx, layer, overrides)
  } else if (layer.type === 'text') {
    drawText(ctx, layer, paramValues)
  } else if (layer.type === 'image') {
    drawImageLayer(ctx, layer, assets)
  } else if (layer.type === 'video') {
    drawVideoLayer(ctx, layer, assets)
  } else if (layer.type === 'pathStroke') {
    drawPathStrokeLayer(ctx, layer, overrides)
  }
  // audio: no canvas rendering (handled by an AudioEngine)

  // ── Selection outline ─────────────────────────────────────────────────
  if (isSelected) {
    const w = layer.size?.width  ?? 0
    const h = layer.size?.height ?? (layer.text?.fontSize ?? 20)
    ctx.filter      = 'none'
    ctx.strokeStyle = '#60A5FA'
    ctx.lineWidth   = 1.5 / ((scaleX + scaleY) / 2)
    ctx.setLineDash([4, 3])
    ctx.strokeRect(-2, -2, w + 4, h + 4)
    ctx.setLineDash([])
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
  const anySolo = scene.layers.some((l) => l.solo)

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
): string | null {
  return hitTestLayersAt(scene, timeMs, canvasX, canvasY)[0] ?? null
}

/**
 * Returns ALL layer ids whose bounding box contains the point, ordered top of
 * stack → bottom. Used for Alt+click "click-through": pick the next id after
 * the currently selected one, letting the user reach layers buried beneath a
 * larger one without reordering.
 */
export function hitTestLayersAt(
  scene: ChronoScene,
  timeMs: number,
  canvasX: number,
  canvasY: number,
): string[] {
  const overrides = evaluateTimelines(scene.timelines, timeMs)
  const hits: string[] = []
  for (let i = scene.layers.length - 1; i >= 0; i--) {
    const layer = scene.layers[i]
    if (layer.hidden || layer.locked) continue
    if (layer.type === 'audio') continue
    const w = layer.size?.width  ?? 80
    const h = layer.size?.height ?? (layer.text?.fontSize ?? 24)
    const x = getLayerValue(overrides, layer.id, 'transform.x', layer.transform.x)
    const y = getLayerValue(overrides, layer.id, 'transform.y', layer.transform.y)
    if (canvasX >= x && canvasX <= x + w && canvasY >= y && canvasY <= y + h) {
      hits.push(layer.id)
    }
  }
  return hits
}
