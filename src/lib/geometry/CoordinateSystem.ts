// ── Coordinate Space Contracts ────────────────────────────────────────────────
//
// Chorono operates across FOUR coordinate spaces. Mixing them silently is the
// #1 source of layout bugs. We use TypeScript brand types so the compiler
// catches accidental conversions.
//
//   LocalPoint  — inside a layer's own origin (post-anchor, post-rotation)
//   WorldPoint  — composition coordinates (0,0 to composition.width/height)
//   ScreenPoint — CSS pixels inside the canvas viewport (post pan/zoom)
//   CanvasPoint — device pixels (post DPI) — only the renderer touches these
//
// To move between spaces, use the helpers in CoordinateTransforms.ts (added
// when Matrix2D matures). Until then, treat the brand types as documentation
// + accidental-mix protection.

/** Layer-local coordinates: (0, 0) = layer origin (pre-transform). */
export type LocalPoint = { readonly __space: 'local'; x: number; y: number }

/** Composition / world coordinates: (0, 0) = top-left of composition. */
export type WorldPoint = { readonly __space: 'world'; x: number; y: number }

/** CSS pixel coordinates inside the canvas DOM element (post pan/zoom). */
export type ScreenPoint = { readonly __space: 'screen'; x: number; y: number }

/** Device pixels (CSS × devicePixelRatio). Only the renderer should care. */
export type CanvasPoint = { readonly __space: 'canvas'; x: number; y: number }

// ── Constructors (no runtime overhead, just type assertions) ──────────────────

export const local  = (x: number, y: number): LocalPoint  => ({ __space: 'local',  x, y })
export const world  = (x: number, y: number): WorldPoint  => ({ __space: 'world',  x, y })
export const screen = (x: number, y: number): ScreenPoint => ({ __space: 'screen', x, y })
export const canvas = (x: number, y: number): CanvasPoint => ({ __space: 'canvas', x, y })

// ── Generic 2D vector (untyped, used for math primitives) ─────────────────────

export interface Vec2 {
  x: number
  y: number
}

/** Structural finite 2D vector guard. Extra point metadata remains compatible;
 * consumers requiring an atomic value additionally check its exact keys. */
export function isVec2(value: unknown): value is Vec2 {
  return !!value && typeof value === 'object' && ['x', 'y'].every(key => {
    const component = (value as Record<string, unknown>)[key]
    return typeof component === 'number' && Number.isFinite(component)
  })
}

export const vec2 = (x: number, y: number): Vec2 => ({ x, y })

// ── Helpers ───────────────────────────────────────────────────────────────────

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}
