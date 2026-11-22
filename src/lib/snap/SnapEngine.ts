// ── Snap Engine — central precision motor ─────────────────────────────────
// Single entry point for every snap operation across the editor. Stateless
// (settings + context passed per call) so the existing snapRef pattern in
// SceneCanvas keeps working unchanged.
//
// BL-26 scope (this file):
//   - snapRect()   — canvas object snap (delegates to CanvasSnapCollector)
//   - snapPoint()  — single-point snap (stub for BL-27 vertex/segment)
//   - snapAngle()  — rotate gizmo angle snap (BL-28 will activate)
//   - snapScale()  — scale gizmo/selection percentage increments
//
// Future BLs add collectors (Spline/Modifier/Timeline) without touching
// callers — they receive the same SnapResult shape via the same API.

import { canvasSnap, type CanvasSnapContext } from './CanvasSnapCollector'
import type { SnapResult, SnapRect, Vec2 } from './SnapCandidate'
import { snapRect as resolveTargets } from './AlignmentGuides'
import { validGridSpacing, gridSnappingEnabled } from './gridSettings'

/** Engine settings — mirrors useSnapSettings hook, decoupled from React. */
export interface SnapEngineSettings {
  enabled:  boolean
  radiusPx: number
  targets: {
    grid:    boolean
    objects: boolean
    /** Immediate parent bounds; absent preserves older settings records. */
    parent?: boolean
    points:  boolean
    guides:  boolean
    pixel:   boolean
    vertex:  boolean
    segment: boolean
  }
  grid:  { sizePx: number; subdivisions?: number; visible?: boolean }
  angle: { enabled: boolean; stepDeg: number }
  scale: { enabled: boolean; stepPercent: number }
}

/** Round a value to the nearest multiple of `step`. Returns input when step ≤ 0. */
function snapToStep(v: number, step: number): number {
  if (!Number.isFinite(step) || step <= 0) return v
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

  /** Current hit radius in composition pixels at the given CSS viewport zoom. */
  radiusWorld(zoom = 1): number {
    const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
    return Number.isFinite(this.settings.radiusPx) ? Math.max(0, this.settings.radiusPx) / scale : 0
  }

  /**
   * Resolve all enabled geometric targets together, independently per axis.
   * Nearest distance wins inside a constant screen-pixel radius. Exact ties
   * prefer custom guides, parent bounds, ordinary bounds/centers, then grid.
   * Grid aligns the source origin to the same zero-origin composition lattice
   * drawn in the viewport. Pixel rounding is fallback only, preserving exact
   * fractional edge/grid hits. No target can overwrite an earlier axis winner.
   */
  snapRect(rect: SnapRect, ctx: CanvasSnapContext): SnapResult {
    const s = this.settings
    if (!s.enabled) return noSnap({ x: rect.x, y: rect.y })

    const targets = canvasSnap.collect({ ...ctx, includeObjects: s.targets.objects, includePoints: s.targets.points,
      parentBounds: s.targets.parent ? ctx.parentBounds : undefined,
      customGuides: s.targets.guides ? ctx.customGuides : undefined })
    if (gridSnappingEnabled(s) && validGridSpacing(s.grid.sizePx)) targets.push(
      { axis: 'v', position: snapToStep(rect.x, s.grid.sizePx), source: 'grid', originOnly: true },
      { axis: 'h', position: snapToStep(rect.y, s.grid.sizePx), source: 'grid', originOnly: true })
    const zoom = ctx.zoom && Number.isFinite(ctx.zoom) && ctx.zoom > 0 ? ctx.zoom : 1
    const radius = this.radiusWorld(zoom)
    const resolved = resolveTargets(rect, targets, radius), guides = resolved.guides
    let nx = resolved.x, ny = resolved.y
    if (s.targets.pixel) {
      if (!guides.some(g => g.axis === 'v')) { nx = Math.round(nx); guides.push({ axis: 'v', position: nx, source: 'pixel' }) }
      if (!guides.some(g => g.axis === 'h')) { ny = Math.round(ny); guides.push({ axis: 'h', position: ny, source: 'pixel' }) }
    }
    return { snapped: guides.length > 0, point: { x: nx, y: ny }, delta: { x: nx - rect.x, y: ny - rect.y }, guides }
  }

  /**
   * Snap a clone translation to the nearest composition axis when the
   * pointer is already travelling almost horizontally or vertically.
   *
   * The tolerance combines the configured screen-pixel snap radius with an
   * 8° angular corridor. It is intentionally gated by the master snap switch
   * and does not affect ordinary move drags; clone callers opt into this
   * interaction-specific rule explicitly.
   */
  snapTranslationAxis(delta: Vec2, zoom = 1): Vec2 {
    if (!this.settings.enabled || !Number.isFinite(delta.x) || !Number.isFinite(delta.y)) return delta
    const radius = this.radiusWorld(zoom)
    const angular = Math.tan(8 * Math.PI / 180)
    const horizontalTolerance = Math.max(radius, Math.abs(delta.x) * angular)
    const verticalTolerance = Math.max(radius, Math.abs(delta.y) * angular)
    if (Math.abs(delta.x) >= Math.abs(delta.y) && Math.abs(delta.y) <= horizontalTolerance) {
      return { x: delta.x, y: 0 }
    }
    if (Math.abs(delta.y) > Math.abs(delta.x) && Math.abs(delta.x) <= verticalTolerance) {
      return { x: 0, y: delta.y }
    }
    return delta
  }

  /** Point/pointer acquisition uses the same targets and screen radius as
   * dragging bounds. Returns guides for editor feedback; never warps the OS
   * cursor or mutates the input. A zero-size rectangle has one unique anchor. */
  resolvePoint(point: Vec2, context: CanvasSnapContext): SnapResult {
    return this.snapRect({ ...point, width: 0, height: 0 }, context)
  }

  /**
   * Single-point snap. BL-27 will collect vertex / segment targets here
   * (pen tool path-aware snap). Today reduces to grid + pixel only.
   */
  snapPoint(p: Vec2, context?: CanvasSnapContext): Vec2 {
    if (context) return this.resolvePoint(p, context).point
    const s = this.settings
    if (!s.enabled) return p
    let nx = p.x, ny = p.y
    if (gridSnappingEnabled(s)) {
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
    if (!this.angleSnappingEnabled) return deg
    return snapToStep(deg, this.settings.angle.stepDeg)
  }

  /** Rotation is independently enabled; Move's switch does not gate it. */
  get angleSnappingEnabled(): boolean {
    const cfg = this.settings.angle
    return cfg.enabled && Number.isFinite(cfg.stepDeg) && cfg.stepDeg > 0
  }

  /**
   * Snap a scale factor. BL-29: when scale.enabled, rounds to the nearest
   * stepPercent multiple (5% step → snaps to 1.00, 1.05, 1.10, …).
   */
  snapScale(s: number): number {
    const cfg = this.settings.scale
    if (!this.scaleSnappingEnabled) return s
    const step = cfg.stepPercent / 100
    return snapToStep(s, step)
  }

  /** Scale increments are independent of Move's point/edge snapping switch. */
  get scaleSnappingEnabled(): boolean {
    const cfg = this.settings.scale
    return cfg.enabled && Number.isFinite(cfg.stepPercent) && cfg.stepPercent > 0
  }
}
