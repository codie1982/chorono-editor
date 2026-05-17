'use client'
import { useState, useMemo } from 'react'

/**
 * Snap settings — shared between SceneCanvas (consumer) and SnapPanel (editor).
 * Held at the page level so both views see the same state and a dockable
 * panel can edit settings independently of where the canvas lives.
 *
 * Snap subsystem inventory (3DS Max-inspired) — fields not yet wired to the
 * canvas are present so the panel can show them today and the engine work
 * (BL-26+ in the backlog) can switch them on incrementally without breaking
 * persistence.
 */
export interface SnapSettings {
  /** Master toggle — everything beneath is gated on this. */
  enabled: boolean

  /** Hit radius in screen px — how close the source must be to a target. */
  radiusPx: number

  /** Per-target toggles (canvas snap). */
  targets: {
    grid:    boolean
    objects: boolean
    points:  boolean
    guides:  boolean
    pixel:   boolean
    /** Spline / pen — vertex snap. Wired in BL-27. */
    vertex:  boolean
    /** Spline / pen — closest-point-on-segment snap. */
    segment: boolean
  }

  /** Grid spacing in composition px. */
  grid: {
    sizePx: number
    /** Subdivisions between major lines. UI-only for now (BL-26). */
    subdivisions: number
  }

  /** Angle snap for the Rotate gizmo (Shift = temporary enable). BL-28. */
  angle: {
    enabled: boolean
    stepDeg: number
  }

  /** Percent step for the Scale gizmo. BL-29. */
  scale: {
    enabled: boolean
    stepPercent: number
  }
}

const DEFAULTS: SnapSettings = {
  enabled:  true,
  radiusPx: 6,
  targets: {
    grid:    false,
    objects: true,
    points:  true,
    guides:  true,
    pixel:   false,
    vertex:  true,
    segment: true,
  },
  grid:  { sizePx: 20, subdivisions: 4 },
  angle: { enabled: false, stepDeg: 15 },
  scale: { enabled: false, stepPercent: 5 },
}

export interface SnapSettingsHook {
  settings: SnapSettings
  setEnabled:        (v: boolean) => void
  setRadiusPx:       (v: number)  => void
  setTarget:         <K extends keyof SnapSettings['targets']>(key: K, v: boolean) => void
  setGridSize:       (v: number)  => void
  setGridSubdivs:    (v: number)  => void
  setAngleEnabled:   (v: boolean) => void
  setAngleStep:      (v: number)  => void
  setScaleEnabled:   (v: boolean) => void
  setScaleStep:      (v: number)  => void
  resetDefaults:     () => void
}

export function useSnapSettings(): SnapSettingsHook {
  const [settings, setSettings] = useState<SnapSettings>(DEFAULTS)

  // Stable callback object — children that consume only setters never need
  // to re-render when `settings` changes.
  return useMemo<SnapSettingsHook>(() => ({
    settings,
    setEnabled:      (v) => setSettings((s) => ({ ...s, enabled: v })),
    setRadiusPx:     (v) => setSettings((s) => ({ ...s, radiusPx: v })),
    setTarget:       (k, v) => setSettings((s) => ({ ...s, targets: { ...s.targets, [k]: v } })),
    setGridSize:     (v) => setSettings((s) => ({ ...s, grid: { ...s.grid, sizePx: v } })),
    setGridSubdivs:  (v) => setSettings((s) => ({ ...s, grid: { ...s.grid, subdivisions: v } })),
    setAngleEnabled: (v) => setSettings((s) => ({ ...s, angle: { ...s.angle, enabled: v } })),
    setAngleStep:    (v) => setSettings((s) => ({ ...s, angle: { ...s.angle, stepDeg: v } })),
    setScaleEnabled: (v) => setSettings((s) => ({ ...s, scale: { ...s.scale, enabled: v } })),
    setScaleStep:    (v) => setSettings((s) => ({ ...s, scale: { ...s.scale, stepPercent: v } })),
    resetDefaults:   () => setSettings(DEFAULTS),
  }), [settings])
}
