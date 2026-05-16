// ── Shape Style System ────────────────────────────────────────────────────────
// fill and stroke are both optional — enabling fill-only, stroke-only, or both.

// ── Gradient ──────────────────────────────────────────────────────────────────

export interface GradientStop {
  /** Position along the gradient axis: 0 (start) → 1 (end) */
  offset: number
  /** Hex colour string: '#rrggbb' or '#rrggbbaa' */
  color: string
}

export interface GradientFill {
  type: 'linear' | 'radial'
  /** Linear only: 0 = top→bottom, 90 = left→right, 135 = diagonal */
  angle?: number
  /** At least two stops required for a valid gradient */
  stops: GradientStop[]
}

// ── Fill ──────────────────────────────────────────────────────────────────────

export interface ShapeFill {
  type: 'solid' | 'gradient'
  /** Solid fill colour (hex) */
  color?: string
  /** Fill opacity 0–100, independent of layer opacity. Default 100. */
  opacity?: number
  /** Used when type === 'gradient' */
  gradient?: GradientFill
}

// ── Stroke ────────────────────────────────────────────────────────────────────

export type StrokeAlignment = 'inside' | 'center' | 'outside'
export type LineCap  = 'butt' | 'round' | 'square'
export type LineJoin = 'miter' | 'round' | 'bevel'

export interface ShapeStroke {
  color: string
  /** Stroke thickness in px */
  width: number
  /** Stroke opacity 0–100. Default 100. */
  opacity?: number
  /** Where to draw relative to path edge. Default 'center'. */
  alignment?: StrokeAlignment
  /** Dash pattern, e.g. [] = solid, [8,4] = dashed, [2,4] = dotted */
  dashArray?: number[]
  lineCap?:  LineCap
  lineJoin?: LineJoin
}

// ── Unified ShapeStyle ────────────────────────────────────────────────────────

export interface ShapeStyle {
  /** undefined = no fill (fully transparent background) */
  fill?: ShapeFill
  /** undefined = no stroke (no border) */
  stroke?: ShapeStroke
  /** Rect only. 0 = sharp corners. Animatable. */
  cornerRadius?: number
}

// ── Scenario examples ─────────────────────────────────────────────────────────
/*
  Fill only (solid blue):
    style: { fill: { type: 'solid', color: '#3B82F6' } }

  Stroke only (border, no background):
    style: { stroke: { color: '#3B82F6', width: 2 } }

  Semi-transparent fill + inside border:
    style: {
      fill:   { type: 'solid', color: '#3B82F6', opacity: 40 },
      stroke: { color: '#ffffff', width: 1, alignment: 'inside' },
    }

  Linear gradient:
    style: {
      fill: {
        type: 'gradient',
        gradient: {
          type: 'linear', angle: 135,
          stops: [{ offset: 0, color: '#6366F1' }, { offset: 1, color: '#EC4899' }],
        },
      },
    }

  Dashed border, no fill:
    style: { stroke: { color: '#F59E0B', width: 2, dashArray: [8,4], lineCap: 'round' } }
*/
