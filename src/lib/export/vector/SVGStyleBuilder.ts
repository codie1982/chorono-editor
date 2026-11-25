// ── SVGStyleBuilder ───────────────────────────────────────────────────────────
//
// BL-84 — translates a Chorono ShapeStyle (fill / stroke / gradient) into SVG
// presentation attributes. Gradients are collected into a shared <defs> via a
// GradientRegistry so identical gradients are emitted once and referenced by id.

import { imagePlacement, type PaintBox } from '../../paint/imagePlacement'
import { gradientStops } from '../../paint/gradientStops'
import { advancedGradientDef } from './SVGAdvancedGradient'
import { activeStrokeDash, strokePaintBox } from '../../paint/strokeStyle'
import { strokeType } from '../../paint/paintSource'
import type { Asset, ImagePaint, ShapeStyle, GradientFill } from '@/lib/types'

import { num, escapeXml } from './SVGValues'
export { num, escapeXml } from './SVGValues'

/**
 * Collects gradients and shared image paint definitions for one SVG export.
 * IDs are document-local and deterministic for traversal order. Encoded image
 * bytes are emitted once per asset; patterns only store local placement. This
 * object holds strings, performs no IO and is discarded with the export job.
 */
export class GradientRegistry {
  readonly warnings: string[] = []
  private defs: string[] = []
  private seen = new Map<string, string>()
  private imageSources = new Map<string, string>()

  /** Register a gradient, returning the `url(#id)` reference for fill/stroke. */
  register(gradient: GradientFill, box?: PaintBox, outsetPx = 0): string {
    const key = JSON.stringify([gradient, box, outsetPx])
    const existing = this.seen.get(key)
    if (existing) return `url(#${existing})`

    const id = `grad${this.seen.size}`
    this.seen.set(key, id)
    this.defs.push(this.buildGradientDef(id, gradient, box, outsetPx))
    return `url(#${id})`
  }

  /** Shared unit-size image definitions avoid duplicating encoded bytes for
   * every shape/pattern. Placement uses the same local box as Canvas. No IO. */
  registerImage(paint: ImagePaint, box: PaintBox, asset: Asset): string {
    const placement = imagePlacement(paint, box, asset.width ?? 0, asset.height ?? 0)
    if (!placement) throw new Error('SVG image paint requires valid source dimensions. Reimport the image or use raster output.')
    let sourceId = this.imageSources.get(asset.id)
    if (!sourceId) {
      sourceId = `paintSource${this.imageSources.size}`; this.imageSources.set(asset.id, sourceId)
      this.defs.push(`<image id="${sourceId}" width="1" height="1" preserveAspectRatio="none" href="${escapeXml(asset.url)}"/>`)
    }
    const key = JSON.stringify(['image', asset.id, paint, box]), old = this.seen.get(key)
    if (old) return old
    const id = `paintImage${this.seen.size}`, reference = `url(#${id})`
    this.seen.set(key, reference)
    const p = placement, transform = `translate(${num(p.x, 8)} ${num(p.y, 8)}) rotate(${num(p.rotationDeg, 8)}) scale(${num(p.scale, 8)}) translate(${num(-p.width / 2, 8)} ${num(-p.height / 2, 8)}) scale(${num(p.width, 8)} ${num(p.height, 8)})`
    if (paint.repeat) {
      const tileTransform = `translate(${p.x} ${p.y}) rotate(${p.rotationDeg}) scale(${p.scale}) translate(${-p.width / 2} ${-p.height / 2})`
      this.defs.push(`<pattern id="${id}" patternUnits="userSpaceOnUse" width="${p.width}" height="${p.height}" patternTransform="${tileTransform}"><use href="#${sourceId}" transform="scale(${p.width} ${p.height})"/></pattern>`)
      return reference
    }
    this.defs.push(`<pattern id="${id}" patternUnits="userSpaceOnUse" x="${num(box.x, 8)}" y="${num(box.y, 8)}" width="${num(box.width, 8)}" height="${num(box.height, 8)}" viewBox="${num(box.x, 8)} ${num(box.y, 8)} ${num(box.width, 8)} ${num(box.height, 8)}"><use href="#${sourceId}" transform="${transform}"/></pattern>`)
    return reference
  }

  /** All collected <linearGradient> / <radialGradient> elements. */
  toDefs(): string {
    return this.defs.join('\n')
  }

  /** Local-coordinate closed-stroke clipping, matching Canvas nonzero/evenodd
   * area masks even with No Fill. Outside never depends on fill opacity. */
  registerStrokeRegion(path: string, rule: 'nonzero' | 'evenodd', box: PaintBox, side: 'inside' | 'outside', width: number): string {
    const key = JSON.stringify(['stroke-region', path, rule, box, side, width]), old = this.seen.get(key)
    if (old) return old
    const id = `strokeRegion${this.seen.size}`, attr = side === 'inside' ? `clip-path="url(#${id})"` : `mask="url(#${id})"`
    this.seen.set(key, attr)
    if (side === 'inside') this.defs.push(`<clipPath id="${id}" clipPathUnits="userSpaceOnUse"><path d="${escapeXml(path)}" clip-rule="${rule}"/></clipPath>`)
    else {
      const pad = width * 10 + 2, x = box.x - pad, y = box.y - pad, w = box.width + pad * 2, h = box.height + pad * 2
      this.defs.push(`<mask id="${id}" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}" style="mask-type:luminance"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="white"/><path d="${escapeXml(path)}" fill="black" fill-rule="${rule}"/></mask>`)
    }
    return attr
  }

  private buildGradientDef(id: string, g: GradientFill, box?: PaintBox, outsetPx = 0): string {
    if (g.type === 'angle' || g.type === 'diamond') {
      if (g.type === 'angle') this.warnings.push('Angle gradient SVG uses 720 vector sectors; raster output keeps the continuous Canvas gradient.')
      return advancedGradientDef(id, g, box ?? { x: 0, y: 0, width: 1, height: 1 }, outsetPx)
    }
    const stops = gradientStops(g)
      .map((s) => `<stop offset="${num(s.offset)}" stop-color="${escapeXml(s.color)}"/>`)
      .join('')

    if (g.type === 'radial' && box) return `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${box.x + box.width / 2}" cy="${box.y + box.height / 2}" r="${Math.min(box.width, box.height) / 2}">${stops}</radialGradient>`
    if (g.type === 'radial') {
      return `<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.5">${stops}</radialGradient>`
    }
    // Linear: map angle (0 = left→right, 90 = top→bottom) to gradient vector.
    const angle = ((g.angle ?? 0) * Math.PI) / 180
    const x1 = num((box?.x ?? 0) + (box?.width ?? 1) * (0.5 - Math.cos(angle) * 0.5))
    const y1 = num((box?.y ?? 0) + (box?.height ?? 1) * (0.5 - Math.sin(angle) * 0.5))
    const x2 = num((box?.x ?? 0) + (box?.width ?? 1) * (0.5 + Math.cos(angle) * 0.5))
    const y2 = num((box?.y ?? 0) + (box?.height ?? 1) * (0.5 + Math.sin(angle) * 0.5))
    return `<linearGradient id="${id}"${box ? ' gradientUnits="userSpaceOnUse"' : ''} x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops}</linearGradient>`
  }
}

/**
 * Builds the fill/stroke presentation attributes for a shape/path element.
 * Returns a space-prefixed attribute string (or '' when no paint applies).
 */
export function buildStyleAttrs(
  style: ShapeStyle | undefined,
  gradients: GradientRegistry,
  imageContext?: { assets: readonly Asset[]; box: PaintBox },
): string {
  const attrs: string[] = []

  // ── Fill ──────────────────────────────────────────────────────────────────
  if (style?.fill) {
    const f = style.fill
    if (f.type === 'none') attrs.push('fill="none"')
    else if (f.type === 'image') {
      const asset = imageContext?.assets.find(item => item.id === f.image?.assetId)
      if (!asset || !f.image || !imageContext) throw new Error('SVG image paint references a missing image. Choose a source or use None.')
      attrs.push(`fill="${gradients.registerImage(f.image, imageContext.box, asset)}"`)
    } else if (f.type === 'gradient' && f.gradient) {
      attrs.push(`fill="${gradients.register(f.gradient, imageContext?.box)}"`)
    } else if (f.color) {
      attrs.push(`fill="${escapeXml(f.color)}"`)
    }
    if (f.opacity != null && f.opacity < 100) {
      attrs.push(`fill-opacity="${num(f.opacity / 100)}"`)
    }
  } else {
    // No fill defined → explicit none so the browser default (black) is avoided.
    attrs.push('fill="none"')
  }

  // ── Stroke ──────────────────────────────────────────────────────────────────
  if (style?.stroke && strokeType(style.stroke) !== 'none' && style.stroke.width > 0) {
    const s = style.stroke, paintBox = imageContext && strokePaintBox(imageContext.box, s.width)
    if (strokeType(s) === 'pattern') {
      const asset = imageContext?.assets.find(asset => asset.id === s.image?.assetId && asset.type === 'image')
      if (!s.image?.assetId) attrs.push('stroke="none"')
      else if (!asset || !imageContext) throw new Error('Pattern stroke requires a registered image asset for SVG export.')
      else attrs.push(`stroke="${gradients.registerImage({ ...s.image, repeat: true }, paintBox!, asset)}"`)
    } else if (strokeType(s) === 'gradient' && s.gradient) {
      attrs.push(`stroke="${gradients.register(s.gradient, paintBox, s.width * 10 + 2)}"`)
    } else {
      attrs.push(`stroke="${escapeXml(s.color)}"`)
    }
    attrs.push(`stroke-width="${num(s.width)}"`)
    if (s.opacity != null && s.opacity < 100) {
      attrs.push(`stroke-opacity="${num(s.opacity / 100)}"`)
    }
    const dash = activeStrokeDash(s)
    if (dash.length > 0) {
      attrs.push(`stroke-dasharray="${dash.map((d) => num(d)).join(',')}"`)
    }
    if (s.lineCap)  attrs.push(`stroke-linecap="${s.lineCap}"`)
    if (s.lineJoin) attrs.push(`stroke-linejoin="${s.lineJoin}"`)
  }

  return attrs.length > 0 ? ' ' + attrs.join(' ') : ''
}
