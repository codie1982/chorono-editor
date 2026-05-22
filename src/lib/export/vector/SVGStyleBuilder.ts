// ── SVGStyleBuilder ───────────────────────────────────────────────────────────
//
// BL-84 — translates a Chorono ShapeStyle (fill / stroke / gradient) into SVG
// presentation attributes. Gradients are collected into a shared <defs> via a
// GradientRegistry so identical gradients are emitted once and referenced by id.

import type { ShapeStyle, GradientFill } from '@/lib/types'

/** Rounds to a fixed precision and strips trailing zeros for compact output. */
export function num(n: number, precision = 2): string {
  if (!Number.isFinite(n)) return '0'
  return parseFloat(n.toFixed(precision)).toString()
}

/** Escapes a string for safe inclusion in an XML attribute value. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Collects gradient definitions during export so the orchestrator can emit a
 * single <defs> block. Each unique gradient gets a stable id.
 */
export class GradientRegistry {
  private defs: string[] = []
  private seen = new Map<string, string>()

  /** Register a gradient, returning the `url(#id)` reference for fill/stroke. */
  register(gradient: GradientFill): string {
    const key = JSON.stringify(gradient)
    const existing = this.seen.get(key)
    if (existing) return `url(#${existing})`

    const id = `grad${this.seen.size}`
    this.seen.set(key, id)
    this.defs.push(this.buildGradientDef(id, gradient))
    return `url(#${id})`
  }

  /** All collected <linearGradient> / <radialGradient> elements. */
  toDefs(): string {
    return this.defs.join('\n')
  }

  private buildGradientDef(id: string, g: GradientFill): string {
    const stops = g.stops
      .map((s) => `<stop offset="${num(s.offset)}" stop-color="${escapeXml(s.color)}"/>`)
      .join('')

    if (g.type === 'radial') {
      return `<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.5">${stops}</radialGradient>`
    }
    // Linear: map angle (0 = top→bottom, 90 = left→right) to gradient vector.
    const angle = ((g.angle ?? 0) * Math.PI) / 180
    const x1 = num(0.5 - Math.cos(angle) * 0.5)
    const y1 = num(0.5 - Math.sin(angle) * 0.5)
    const x2 = num(0.5 + Math.cos(angle) * 0.5)
    const y2 = num(0.5 + Math.sin(angle) * 0.5)
    return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops}</linearGradient>`
  }
}

/**
 * Builds the fill/stroke presentation attributes for a shape/path element.
 * Returns a space-prefixed attribute string (or '' when no paint applies).
 */
export function buildStyleAttrs(
  style: ShapeStyle | undefined,
  gradients: GradientRegistry,
): string {
  const attrs: string[] = []

  // ── Fill ──────────────────────────────────────────────────────────────────
  if (style?.fill) {
    const f = style.fill
    if (f.type === 'gradient' && f.gradient) {
      attrs.push(`fill="${gradients.register(f.gradient)}"`)
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
  if (style?.stroke && style.stroke.width > 0) {
    const s = style.stroke
    if (s.gradient) {
      attrs.push(`stroke="${gradients.register(s.gradient)}"`)
    } else {
      attrs.push(`stroke="${escapeXml(s.color)}"`)
    }
    attrs.push(`stroke-width="${num(s.width)}"`)
    if (s.opacity != null && s.opacity < 100) {
      attrs.push(`stroke-opacity="${num(s.opacity / 100)}"`)
    }
    if (s.dashArray && s.dashArray.length > 0) {
      attrs.push(`stroke-dasharray="${s.dashArray.map((d) => num(d)).join(',')}"`)
    }
    if (s.lineCap)  attrs.push(`stroke-linecap="${s.lineCap}"`)
    if (s.lineJoin) attrs.push(`stroke-linejoin="${s.lineJoin}"`)
  }

  return attrs.length > 0 ? ' ' + attrs.join(' ') : ''
}
