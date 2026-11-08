// ── SVGExporter ───────────────────────────────────────────────────────────────
//
// BL-84 — exports a scene frame to a static SVG document. Shapes and paths are
// converted to <path> via the shared geometry pipeline (ShapeToPathConverter /
// bezierPathToPathDefinition → pathToSvgString), text to <text>, and groups to
// nested <g>. Transforms/opacity are resolved at the requested time so the SVG
// matches the on-screen frame.
//
// V1 scope: shape, path, text, group. Unsupported kinds (image, video, spline,
// particles, masks, effects) are skipped with a warning — vector export of
// raster/procedural content needs a bake step (future).

import type { ChronoScene, Layer, Transform } from '@/lib/types'
import { ShapeToPathConverter, pathToSvgString, type Size } from '@/lib/geometry'
import { bezierPathToPathDefinition } from '@/lib/path/bezierToPathDefinition'
import { evaluateTimelines, getLayerValue } from '@/lib/evaluator'
import { materializeRenderScene } from '@/lib/render/materializeOverrides'
import {
  GradientRegistry,
  buildStyleAttrs,
  escapeXml,
  num,
} from './SVGStyleBuilder'
import { collectLayerAnimations } from './SVGAnimationBuilder'
import {BoundedTextBuilder} from '../../format/text'
import {measureJson} from '../../format/json'
import {LayerIndex} from '../../scene/LayerIndex'
import {preflightSvgOutput,resolveSvgOutputLimits,type SVGOutputLimits} from './SVGOutputLimits'

export type SVGBackground = 'scene' | 'transparent' | { color: string }

export interface SVGExportOptions {
  /** Background fill. Default 'scene' (composition.backgroundColor). */
  background?: SVGBackground
  /** Frame to capture for the STATIC export (ms). Default 0. */
  timeMs?: number
  /** Decimal places for numeric output. Default 2. */
  precision?: number
  /**
   * BL-84 — when true, emit SMIL <animateTransform>/<animate> so the SVG plays
   * itself. Transform/opacity tracks become looping animations. Default false
   * (single-frame static export).
   */
  animated?: boolean
  /** Finite construction policy; refusal does not truncate or lower detail. */
  limits?:Partial<SVGOutputLimits>
}

export interface SVGExportResult {
  svg: string
  filename: string
  /** Non-fatal advisories — unsupported layer kinds skipped, etc. */
  warnings: string[]
}

type OverrideMap = ReturnType<typeof evaluateTimelines>

/** Layer kinds that V1 static SVG export can faithfully represent. */
const SUPPORTED = new Set<Layer['type']>(['shape', 'path', 'text', 'group'])

/** Serialize the same static/SMIL SVG with bounded geometry/text construction.
 * Scene is borrowed and never changed. Native output ownership belongs to the
 * caller; application jobs use svgInScope through acquireSceneText/download.
 * Invalid/oversized geometry, cycles and unsupported precision reject before
 * dense conversion. Unsupported layer kinds retain their existing warnings. */
export function exportSVG(scene: ChronoScene, opts: SVGExportOptions = {}): SVGExportResult {
  measureJson(scene,{maxBytes:96*1024**2})
  const limits=resolveSvgOutputLimits(opts.limits)
  const { composition } = scene
  const timeMs    = opts.timeMs ?? 0
  const precision = opts.precision ?? 2
  if(!Number.isInteger(precision)||precision<0||precision>12||!Number.isFinite(timeMs))throw new RangeError('Invalid SVG time/precision.')
  const warnings: string[] = []
  const gradients = new GradientRegistry()
  const overrides = evaluateTimelines(scene.timelines, timeMs)
  scene = materializeRenderScene(scene, overrides)
  preflightSvgOutput(scene,opts.animated??false,limits)

  // Solo filter mirrors CanvasRenderer: if any layer is soloed, only soloed
  // layers render.
  const anySolo = scene.layers.some((l) => l.type !== 'audio' && l.solo)
  const isVisible = (l: Layer): boolean => {
    if (anySolo && !l.solo) return false
    if (l.hidden) return false
    if (timeMs < (l.startMs ?? 0)) return false
    if (l.endMs !== undefined && timeMs > l.endMs) return false
    return true
  }

  const ctx: BuildCtx = {
    scene, overrides, gradients, warnings, precision, isVisible, timeMs,
    animated: opts.animated ?? false,
    durationMs: composition.durationMs,
    index:new LayerIndex(scene.layers),
  }

  // Root layers in document order; groups recurse into their children.
  const bodyWriter=new BoundedTextBuilder(limits.maxChars)
  writeChildren(ctx.index.roots,ctx,bodyWriter)
  const body=bodyWriter.finish();bodyWriter.clear()

  // Background rectangle (skipped when transparent).
  const bg = opts.background ?? 'scene'
  const bgColor =
    bg === 'transparent' ? null
    : bg === 'scene'      ? composition.backgroundColor
    : bg.color
  const bgRect = bgColor
    ? `<rect width="${composition.width}" height="${composition.height}" fill="${escapeXml(bgColor)}"/>\n`
    : ''

  const defs = gradients.toDefs()
  const defsBlock = defs ? `<defs>\n${defs}\n</defs>\n` : ''

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `width="${composition.width}" height="${composition.height}" ` +
    `viewBox="0 0 ${composition.width} ${composition.height}">\n` +
    defsBlock +
    bgRect +
    body +
    (body ? '\n' : '') +
    `</svg>\n`
  if(svg.length>limits.maxChars)throw new RangeError('SVG document limit exceeded.')

  return {
    svg,
    filename: `${composition.id || 'scene'}.svg`,
    warnings,
  }
}

// ── Internal ──────────────────────────────────────────────────────────────────

interface BuildCtx {
  scene: ChronoScene
  overrides: OverrideMap
  gradients: GradientRegistry
  warnings: string[]
  precision: number
  isVisible: (l: Layer) => boolean
  timeMs: number
  /** BL-84 animated mode — emit SMIL instead of a frozen frame. */
  animated: boolean
  /** Composition duration used as the SMIL animation period. */
  durationMs: number
  index:LayerIndex
}

/** Resolve the animated transform at the current time (anchors stay static). */
function resolveTransform(layer: Layer, overrides: OverrideMap): Transform {
  const t = layer.transform
  return {
    x:           getLayerValue(overrides, layer.id, 'transform.x', t.x),
    y:           getLayerValue(overrides, layer.id, 'transform.y', t.y),
    scaleX:      getLayerValue(overrides, layer.id, 'transform.scaleX', t.scaleX),
    scaleY:      getLayerValue(overrides, layer.id, 'transform.scaleY', t.scaleY),
    rotationDeg: getLayerValue(overrides, layer.id, 'transform.rotationDeg', t.rotationDeg),
    anchorX:     t.anchorX,
    anchorY:     t.anchorY,
  }
}

/** Build the SVG `transform` attribute mirroring CanvasRenderer's order. */
function transformAttr(t: Transform, precision: number): string {
  const n = (v: number) => num(v, precision)
  const parts: string[] = []
  const tx = t.x + t.anchorX
  const ty = t.y + t.anchorY
  if (tx !== 0 || ty !== 0)            parts.push(`translate(${n(tx)} ${n(ty)})`)
  if (t.rotationDeg !== 0)             parts.push(`rotate(${n(t.rotationDeg)})`)
  if (t.scaleX !== 1 || t.scaleY !== 1) parts.push(`scale(${n(t.scaleX)} ${n(t.scaleY)})`)
  if (t.anchorX !== 0 || t.anchorY !== 0) parts.push(`translate(${n(-t.anchorX)} ${n(-t.anchorY)})`)
  return parts.length > 0 ? ` transform="${parts.join(' ')}"` : ''
}

function opacityAttr(layer: Layer, overrides: OverrideMap, precision: number): string {
  const o = getLayerValue(overrides, layer.id, 'opacity', layer.opacity)
  return o < 1 ? ` opacity="${num(Math.max(0, o), precision)}"` : ''
}

/** Write siblings in original order with the exact old nonempty separators.
 * Group content streams into one builder; it is not copied at each ancestor.
 * Animated empty path/text content still keeps the old SMIL wrapper. */
function writeChildren(layers:readonly Layer[],ctx:BuildCtx,writer:BoundedTextBuilder):void{
  let written=false
  for(const layer of layers){
    if(!ctx.isVisible(layer))continue
    if(!SUPPORTED.has(layer.type)){ctx.warnings.push(`Layer "${layer.name}" (${layer.type}) skipped — not supported by SVG export.`);continue}
    const anims=ctx.animated?collectLayerAnimations(layer,ctx.scene.timelines,ctx.durationMs):null
    if(!anims&&((layer.type==='path'&&!layer.path?.anchors.length)||(layer.type==='text'&&!layer.text)))continue
    if(written)writer.append('\n');written=true
    let xform=transformAttr(resolveTransform(layer,ctx.overrides),ctx.precision),opacity=opacityAttr(layer,ctx.overrides,ctx.precision)
    if(anims){
      writer.append(`<g>\n${anims.transformAnims}${anims.opacityAnim?`\n${anims.opacityAnim}`:''}\n`)
      const {anchorX:ax,anchorY:ay}=layer.transform
      xform=ax!==0||ay!==0?` transform="translate(${num(-ax,ctx.precision)} ${num(-ay,ctx.precision)})"`:'';opacity=''
    }
    if(layer.type==='group'){
      writer.append(`<g${xform}${opacity}>\n`);writeChildren(ctx.index.childrenOf(layer.id),ctx,writer);writer.append('\n</g>')
    }else writer.append(layer.type==='shape'?buildShape(layer,ctx,xform,opacity):layer.type==='path'?buildPath(layer,ctx,xform,opacity):buildText(layer,ctx,xform,opacity))
    if(anims)writer.append('\n</g>')
  }
}

function buildShape(layer: Layer, ctx: BuildCtx, xform: string, opacity: string): string {
  const size: Size = layer.size ?? { width: 0, height: 0 }
  const kind = layer.shapeKind ?? layer.shape ?? 'rect'
  const def = ShapeToPathConverter.convert(kind, size, layer.shapeParams, layer.style?.cornerRadius ?? 0)
  const d = pathToSvgString(def)
  const style = buildStyleAttrs(layer.style, ctx.gradients)
  return `<path d="${d}"${style}${xform}${opacity}/>`
}

function buildPath(layer: Layer, ctx: BuildCtx, xform: string, opacity: string): string {
  if (!layer.path || layer.path.anchors.length === 0) return ''
  const def = bezierPathToPathDefinition(layer.path)
  const d = pathToSvgString(def)
  const style = buildStyleAttrs(layer.style, ctx.gradients)
  return `<path d="${d}"${style}${xform}${opacity}/>`
}

function buildText(layer: Layer, ctx: BuildCtx, xform: string, opacity: string): string {
  const t = layer.text
  if (!t) return ''
  const value = t.uppercase ? t.value.toUpperCase() : t.value
  const anchor = t.textAlign === 'center' ? 'middle' : t.textAlign === 'right' ? 'end' : 'start'
  const attrs: string[] = [
    `x="0"`,
    `y="${num(t.fontSize, ctx.precision)}"`,
    `font-size="${num(t.fontSize, ctx.precision)}"`,
    `fill="${escapeXml(t.color)}"`,
  ]
  if (t.fontFamily)              attrs.push(`font-family="${escapeXml(t.fontFamily)}"`)
  if (t.fontWeight)              attrs.push(`font-weight="${t.fontWeight}"`)
  if (t.fontStyle)              attrs.push(`font-style="${t.fontStyle}"`)
  if (anchor !== 'start')        attrs.push(`text-anchor="${anchor}"`)
  if (t.letterSpacing)           attrs.push(`letter-spacing="${num(t.letterSpacing, ctx.precision)}"`)
  if (t.stroke && t.stroke.width > 0) {
    attrs.push(`stroke="${escapeXml(t.stroke.color)}"`, `stroke-width="${num(t.stroke.width, ctx.precision)}"`)
  }
  return `<text ${attrs.join(' ')}${xform}${opacity}>${escapeXml(value)}</text>`
}
