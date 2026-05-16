// ── SvgStyleParser ────────────────────────────────────────────────────────────
//
// Extracts paint and opacity from an SVG element. SVG style can come from:
//   1. Presentation attributes:  <path fill="red" stroke="blue" />
//   2. Inline style attribute:   <path style="fill: red; stroke: blue" />
//   3. CSS rules (NOT SUPPORTED in V1 — would require full CSS parsing)
//
// Resolution order (per SVG spec):
//   Inline style > Presentation attributes
//
// Returns a normalised SvgComputedStyle that the converter passes to Chorono
// layer factories. Inheritable values are filled by SvgNodeConverter using
// the parent SvgImportContext.
//
// Pure: takes an Element interface, no DOM mutation.

import type { SvgImportWarning } from '@/lib/types/svg'

/** Minimal Element interface — accepts real DOM Element or any look-alike. */
export interface SvgElementLike {
  getAttribute(name: string): string | null
  tagName: string
}

export interface SvgComputedStyle {
  /** Hex string ('#rrggbb') or 'none' / undefined when not set. */
  fill?:        string
  fillOpacity?: number   // 0–1
  stroke?:      string
  strokeOpacity?: number // 0–1
  strokeWidth?: number   // px in user space
  strokeLinecap?:  'butt' | 'round' | 'square'
  strokeLinejoin?: 'miter' | 'round' | 'bevel'
  /** Combined element opacity (multiplied with fill/stroke separately). */
  opacity?:     number   // 0–1
  /** Stroke-dasharray as parsed numbers, e.g. [8, 4]. Empty → undefined. */
  strokeDasharray?: number[]
}

export class SvgStyleParser {
  parse(el: SvgElementLike, _warnings: SvgImportWarning[] = []): SvgComputedStyle {
    const inline = this.parseInlineStyle(el.getAttribute('style'))

    const pick = (name: string): string | null => inline[name] ?? el.getAttribute(name)

    return {
      fill:           this.normalisePaint(pick('fill')),
      fillOpacity:    this.parseNumber(pick('fill-opacity')),
      stroke:         this.normalisePaint(pick('stroke')),
      strokeOpacity:  this.parseNumber(pick('stroke-opacity')),
      strokeWidth:    this.parseLength(pick('stroke-width')),
      strokeLinecap:  this.parseLinecap(pick('stroke-linecap')),
      strokeLinejoin: this.parseLinejoin(pick('stroke-linejoin')),
      opacity:        this.parseNumber(pick('opacity')),
      strokeDasharray: this.parseDashArray(pick('stroke-dasharray')),
    }
  }

  // ── Inline style="…" parser ─────────────────────────────────────────────────

  private parseInlineStyle(str: string | null): Record<string, string> {
    if (!str) return {}
    const out: Record<string, string> = {}
    for (const decl of str.split(';')) {
      const idx = decl.indexOf(':')
      if (idx < 0) continue
      const key = decl.slice(0, idx).trim().toLowerCase()
      const val = decl.slice(idx + 1).trim()
      if (key) out[key] = val
    }
    return out
  }

  // ── Paint (colour) ──────────────────────────────────────────────────────────

  /**
   * Normalises a paint value to a hex string. Accepts:
   *   - 'none'          → 'none'
   *   - '#abc'          → '#aabbcc'
   *   - '#aabbcc'       → '#aabbcc'
   *   - 'rgb(r, g, b)'  → '#rrggbb'
   *   - 'red', 'blue'   → CSS named colours (hex lookup)
   *   - 'url(#grad)'    → not yet supported — returns undefined
   */
  private normalisePaint(value: string | null | undefined): string | undefined {
    if (!value) return undefined
    const v = value.trim().toLowerCase()
    if (v === 'none' || v === 'transparent') return 'none'
    if (v.startsWith('url(')) return undefined  // gradient/pattern — handled later

    if (v.startsWith('#')) {
      if (v.length === 4) {
        // #rgb → #rrggbb
        return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`
      }
      if (v.length === 7) return v
    }

    if (v.startsWith('rgb')) {
      const nums = v.match(/\d+(\.\d+)?/g)
      if (nums && nums.length >= 3) {
        const r = Math.min(255, Math.round(parseFloat(nums[0])))
        const g = Math.min(255, Math.round(parseFloat(nums[1])))
        const b = Math.min(255, Math.round(parseFloat(nums[2])))
        return `#${this.hex2(r)}${this.hex2(g)}${this.hex2(b)}`
      }
    }

    // CSS named colour
    const named = CSS_NAMED_COLOURS[v]
    if (named) return named

    return undefined
  }

  private hex2(n: number): string {
    return n.toString(16).padStart(2, '0')
  }

  // ── Number / length parsing ─────────────────────────────────────────────────

  private parseNumber(value: string | null | undefined): number | undefined {
    if (value == null) return undefined
    const n = parseFloat(value)
    return Number.isFinite(n) ? n : undefined
  }

  /** Strips px/pt/em suffix and returns a raw user-space number. */
  private parseLength(value: string | null | undefined): number | undefined {
    if (value == null) return undefined
    const m = value.match(/^(-?\d+(?:\.\d+)?)/)
    if (!m) return undefined
    return parseFloat(m[1])
  }

  private parseDashArray(value: string | null | undefined): number[] | undefined {
    if (!value || value === 'none') return undefined
    const nums = value.match(/-?\d+(?:\.\d+)?/g)
    if (!nums) return undefined
    const arr = nums.map(parseFloat).filter(Number.isFinite)
    return arr.length > 0 ? arr : undefined
  }

  private parseLinecap(value: string | null | undefined): 'butt' | 'round' | 'square' | undefined {
    if (value === 'butt' || value === 'round' || value === 'square') return value
    return undefined
  }

  private parseLinejoin(value: string | null | undefined): 'miter' | 'round' | 'bevel' | undefined {
    if (value === 'miter' || value === 'round' || value === 'bevel') return value
    return undefined
  }
}

// ── Common CSS named colours (subset — enough for typical SVG icons) ─────────
// Full list would be 140 entries; we cover the dozen-or-so seen in design tools.
const CSS_NAMED_COLOURS: Record<string, string> = {
  black:   '#000000', white:   '#ffffff',
  red:     '#ff0000', green:   '#008000', blue:    '#0000ff',
  yellow:  '#ffff00', cyan:    '#00ffff', magenta: '#ff00ff',
  silver:  '#c0c0c0', gray:    '#808080', grey:    '#808080',
  maroon:  '#800000', olive:   '#808000', purple:  '#800080',
  teal:    '#008080', navy:    '#000080',
  orange:  '#ffa500', pink:    '#ffc0cb', brown:   '#a52a2a',
}
