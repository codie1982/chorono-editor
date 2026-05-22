// ── Text Style System ─────────────────────────────────────────────────────────
// Full typography controls: font, spacing, outline, shadow, decorations.

import type { GradientFill } from './style'

export type FontWeight =
  | 'normal' | 'bold'
  | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900'

export type FontStyle  = 'normal' | 'italic'
export type TextAlign  = 'left' | 'center' | 'right'

// ── Text Outline (Stroke) ─────────────────────────────────────────────────────
// Rendered BEFORE fill so the fill covers the inner half of the stroke.

export interface TextStroke {
  color: string
  /** Outline thickness in px. Rendered centered on the glyph edge. */
  width: number
}

// ── Drop Shadow ───────────────────────────────────────────────────────────────

export interface TextShadow {
  x: number
  y: number
  blur: number
  /** Hex colour string */
  color: string
}

// ── Full TextStyle ────────────────────────────────────────────────────────────

export interface TextStyle {
  value: string
  fontSize: number
  color: string
  /** Optional gradient fill. When set (≥2 stops), it replaces `color`. */
  gradient?: GradientFill

  // ── Font ────────────────────────────────────────────────────────────────────
  fontFamily?: string    // 'Inter', 'Roboto', 'monospace', …
  fontWeight?: FontWeight
  fontStyle?:  FontStyle
  textAlign?:  TextAlign

  // ── Spacing ─────────────────────────────────────────────────────────────────
  /** Extra px between characters. Rendered via manual char-by-char draw. */
  letterSpacing?: number
  /** Line height multiplier. Default 1.2. */
  lineHeight?: number

  // ── Visual Enhancements ──────────────────────────────────────────────────────
  /** Text outline — drawn before fill for correct appearance */
  stroke?: TextStroke
  /** Drop shadow */
  shadow?: TextShadow
  /** Transform displayed text to uppercase (stored value unchanged) */
  uppercase?: boolean
  /** Manual underline drawn via fillRect below the baseline */
  underline?: boolean
}

// ── Animatable text properties ────────────────────────────────────────────────
// text.fontSize      → font grows / shrinks
// text.letterSpacing → spacing widens / narrows
// opacity            → fade (via layer opacity, not TextStyle)
