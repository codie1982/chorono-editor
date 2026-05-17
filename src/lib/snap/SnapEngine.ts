// ── Snap Engine — central precision motor ─────────────────────────────────
// Single entry point for every snap operation across the editor. Stateless
// (settings + context passed per call) so the existing snapRef pattern in
// SceneCanvas keeps working unchanged.
//
// BL-26 scope (this file):
//   - snapRect()   — canvas object snap (delegates to CanvasSnapCollector)
//   - snapPoint()  — single-point snap (stub for BL-27 vertex/segment)
//   - snapAngle()  — rotate gizmo angle snap (BL-28 will activate)
//   - snapScale()  — scale gizmo percent snap (BL-29 will activate)
//
// Future BLs add collectors (Spline/Modifier/Timeline) without touching
// callers — they receive the same SnapResult shape via the same API.

import { canvasSnap, type CanvasSnapContext } from './CanvasSnapCollector'
import type { SnapResult, SnapRect, Vec2 } from './SnapCandidate'

/** Engine settings — mirrors useSnapSettings hook, decoupled from React. */
export interface SnapEngineSettings {
  enabled:  boolean
  radiusPx: number
  targets: {
    grid:    boolean
    objects: boolean
    points:  boolean
    guides:  boolean
    pixel:   boolean
    vertex:  boolean
    segment: boolean
  }
  grid:  { sizePx: number; subdivisions?: number }
  angle: { enabled: boolean; stepDeg: number }
  scale: { enabled: boolean; stepPercent: number }
}

/** Round a value to the nearest multiple of `step`. Returns input when step ≤ 0. */
function snapToStep(v: number, step: number): number {
  if (step <= 0) return v
  return Math.round(v / step) * step
}

/** No-op result for when snap is disabled — keeps the call site branch-free. */
function noSnap(p: Vec2): SnapResult {
  return { snapped: false, point: p, delta: { x: 0, y: 0 }, guides: [] }
}

export class SnapEngine {
  constructor(private settings: SnapEngineSettings) {}

  /** Hot-swap settings (after a panel toggle). Stateless engine so we just
   *  replace the reference; no caches to invalidate yet. */
  setSettings(s: SnapEngineSettings) { this.settings = s }

  /**
   * Snap a moving rectangle (the primary canvas use case). Combines
   * objects → grid → pixel in that order, mirroring the existing
   * SceneCanvas drag pipeline so this method is drop-in.
   */
  snapRect(rect: SnapRect, ctx: CanvasSnapContext): SnapResult {
    const s = this.settings
    if (!s.enabled) return noSnap({ x: rect.x, y: rect.y })

    let nx = rect.x, ny = rect.y
    let guides: SnapResult['guides'] = []

    // ── Object / point snap (alignment to other layers + canvas) ──
    if (s.targets.objects || s.targets.points) {
      const r = canvasSnap.snapRect({ ...rect, x: nx, y: ny }, ctx, s.radiusPx)
      nx = r.point.x; ny = r.point.y
      guides = r.guides
    }

    // ── Grid snap ──
    if (s.targets.grid) {
      nx = snapToStep(nx, s.grid.sizePx)
      ny = snapToStep(ny, s.grid.sizePx)
    }

    // ── Pixel snap — always last, integer-rounds final position ──
    if (s.targets.pixel) {
      nx = Math.round(nx)
      ny = Math.round(ny)
    }

    const snapped = nx !== rect.x || ny !== rect.y
    return {
      snapped,
      point: { x: nx, y: ny },
      delta: { x: nx - rect.x, y: ny - rect.y },
      guides,
    }
  }

  /**
   * Single-point snap. BL-27 will collect vertex / segment targets here
   * (pen tool path-aware snap). Today reduces to grid + pixel only.
   */
  snapPoint(p: Vec2): Vec2 {
    const s = this.settings
    if (!s.enabled) return p
    let nx = p.x, ny = p.y
    if (s.targets.grid) {
      nx = snapToStep(nx, s.grid.sizePx)
      ny = snapToStep(ny, s.grid.sizePx)
    }
    if (s.targets.pixel) {
      nx = Math.round(nx)
      ny = Math.round(ny)
    }
    return { x: nx, y: ny }
  }

  /**
   * Snap a rotation angle (degrees). BL-28: when angle.enabled, rounds to
   * the nearest stepDeg multiple. Identity otherwise.
   */
  snapAngle(deg: number): number {
    const s = this.settings.angle
    if (!s.enabled || s.stepDeg <= 0) return deg
    return snapToStep(deg, s.stepDeg)
  }

  /**
   * Snap a scale factor. BL-29: when scale.enabled, rounds to the nearest
   * stepPercent multiple (5% step → snaps to 1.00, 1.05, 1.10, …).
   */
  snapScale(s: number): number {
    const cfg = this.settings.scale
    if (!cfg.enabled || cfg.stepPercent <= 0) return s
    const step = cfg.stepPercent / 100
    return snapToStep(s, step)
  }
}
