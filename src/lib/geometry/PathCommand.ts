// ── Normalized Path Commands ──────────────────────────────────────────────────
//
// A single, minimal command vocabulary used by every path-emitting source:
//   - Shape → Path conversion (ShapeToPathConverter)
//   - SVG path parser output (SvgPathParser)
//   - Pen Tool / BezierPath rendering (via converter)
//   - Runtime export (RuntimeOptimizer compresses these)
//
// Normalization rules:
//   - All coordinates are ABSOLUTE (no relative l/c/q variants)
//   - H/V are expanded to L
//   - S/T are expanded to C/Q (control point reflected from previous)
//   - A (elliptical arc) is converted to one or more C (cubic) commands
//   - Coordinates are layer-local (post any layer.transform)
//
// This gives the renderer ONE switch over 5 cases instead of 18.

export type NormalizedPathCommand =
  | MoveToCommand
  | LineToCommand
  | CubicToCommand
  | QuadToCommand
  | ClosePathCommand

export interface MoveToCommand    { type: 'M'; x: number; y: number }
export interface LineToCommand    { type: 'L'; x: number; y: number }
export interface CubicToCommand   { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
export interface QuadToCommand    { type: 'Q'; x1: number; y1: number; x: number; y: number }
export interface ClosePathCommand { type: 'Z' }

/**
 * A complete normalized path: ordered commands.
 *
 * `closed` is a hint for the renderer about whether to fill — but the
 * canonical close is via a Z command at the end. Both must agree.
 */
export interface PathDefinition {
  commands: NormalizedPathCommand[]
  closed:   boolean
}

// ── Construction helpers ──────────────────────────────────────────────────────

export const M = (x: number, y: number): MoveToCommand => ({ type: 'M', x, y })
export const L = (x: number, y: number): LineToCommand => ({ type: 'L', x, y })
export const C = (x1: number, y1: number, x2: number, y2: number, x: number, y: number): CubicToCommand =>
  ({ type: 'C', x1, y1, x2, y2, x, y })
export const Q = (x1: number, y1: number, x: number, y: number): QuadToCommand =>
  ({ type: 'Q', x1, y1, x, y })
export const Z = (): ClosePathCommand => ({ type: 'Z' })

// ── Canvas dispatch ───────────────────────────────────────────────────────────

/**
 * Applies a PathDefinition's commands to a 2D canvas context.
 * Uses beginPath() — caller is responsible for fill/stroke afterwards.
 */
export function buildPathOnCanvas(
  ctx: CanvasRenderingContext2D,
  path: PathDefinition,
): void {
  ctx.beginPath()
  for (const cmd of path.commands) {
    switch (cmd.type) {
      case 'M': ctx.moveTo(cmd.x, cmd.y); break
      case 'L': ctx.lineTo(cmd.x, cmd.y); break
      case 'C': ctx.bezierCurveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y); break
      case 'Q': ctx.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y); break
      case 'Z': ctx.closePath(); break
    }
  }
}

// ── SVG path-data string (for export / Inspector display) ─────────────────────

/** Serialise commands to a standard SVG `d` attribute string. */
export function pathToSvgString(path: PathDefinition): string {
  const parts: string[] = []
  for (const c of path.commands) {
    switch (c.type) {
      case 'M': parts.push(`M${c.x} ${c.y}`); break
      case 'L': parts.push(`L${c.x} ${c.y}`); break
      case 'C': parts.push(`C${c.x1} ${c.y1} ${c.x2} ${c.y2} ${c.x} ${c.y}`); break
      case 'Q': parts.push(`Q${c.x1} ${c.y1} ${c.x} ${c.y}`); break
      case 'Z': parts.push('Z'); break
    }
  }
  return parts.join(' ')
}
