'use client'
import { useState, useMemo, useEffect } from 'react'
import { validGridSpacing } from '@/lib/snap/gridSettings'
import { readViewportGrid, writeViewportGrid, VIEWPORT_GRID_STORAGE_KEY } from '@/lib/snap/ViewportGridPreferences'

/**
 * Snap settings — shared between SceneCanvas (consumer) and SnapPanel (editor).
 * Held at the page level so both views see the same state and a dockable
 * panel can edit settings independently of where the canvas lives.
 *
 * Reserved segment/subdivision fields remain for compatible callers.
 * Current precision uses spline drawing vertices, bounds,
 * object points, parent bounds, guides, grid, pixels and independent TRS steps.
 */
export interface SnapSettings {
  /** Move/point snapping switch. Rotation and scale have independent switches. */
  enabled: boolean

  /** Hit radius in screen px — how close the source must be to a target. */
  radiusPx: number

  /** Per-target toggles (canvas snap). */
  targets: {
    grid:    boolean
    objects: boolean
    parent: boolean
    points:  boolean
    guides:  boolean
    pixel:   boolean
    /** Exact spline anchors for pointer drawing; independent of bounds centers. */
    vertex:  boolean
    /** Spline / pen — closest-point-on-segment snap. */
    segment: boolean
  }

  /** Grid spacing in composition px. */
  grid: {
    sizePx: number
    visible: boolean
    inFront: boolean
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
  radiusPx: 12,
  targets: {
    grid:    false,
    objects: true,
    parent: false,
    points:  true,
    guides:  true,
    pixel:   false,
    vertex:  true,
    segment: true,
  },
  grid:  { sizePx: 20, subdivisions: 4, visible: false, inFront: false },
  angle: { enabled: false, stepDeg: 15 },
  scale: { enabled: false, stepPercent: 5 },
}

export interface SnapSettingsHook {
  settings: SnapSettings
  setEnabled:        (v: boolean) => void
  setRadiusPx:       (v: number)  => void
  setTarget:         <K extends keyof SnapSettings['targets']>(key: K, v: boolean) => void
  clearTargets:     () => void
  setGridSize:       (v: number)  => void
  setGridVisible:    (v: boolean) => void
  setGridInFront:    (v: boolean) => void
  setGridSubdivs:    (v: number)  => void
  setAngleEnabled:   (v: boolean) => void
  setAngleStep:      (v: number)  => void
  setScaleEnabled:   (v: boolean) => void
  setScaleStep:      (v: number)  => void
  resetDefaults:     () => void
}

/** One editor's mutable precision settings. Grid preferences hydrate after
 * mount and persist locally; geometry/history are never touched. Private QA
 * hosts disable persistence so tests cannot overwrite real browser preferences. */
export function useSnapSettings({ persist = true, storageKey = VIEWPORT_GRID_STORAGE_KEY }: { persist?: boolean; storageKey?: string } = {}): SnapSettingsHook {
  const [settings, setSettings] = useState<SnapSettings>(DEFAULTS)
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    if (persist) {
      try { const grid = readViewportGrid(window.localStorage, storageKey)
        setSettings(value => ({ ...value, grid: { ...value.grid, ...grid } })) } catch { /* Storage access may be denied. */ }
    }
    setHydrated(true)
  }, [persist, storageKey])
  useEffect(() => {
    if (!persist || !hydrated) return
    try { writeViewportGrid(window.localStorage, settings.grid, storageKey) } catch { /* Keep session preferences in memory. */ }
  }, [persist, storageKey, hydrated, settings.grid])

  // One settings contract serves the viewport, quick menu and docked panel.
  return useMemo<SnapSettingsHook>(() => ({
    settings,
    setEnabled:      (v) => setSettings((s) => ({ ...s, enabled: v })),
    setRadiusPx:     (v) => { if (Number.isFinite(v) && v >= 1 && v <= 30) setSettings((s) => ({ ...s, radiusPx: v })) },
    setTarget:       (k, v) => setSettings((s) => ({ ...s, targets: { ...s.targets, [k]: v } })),
    clearTargets:    () => setSettings(s => ({ ...s, targets: { grid: false, objects: false, parent: false, points: false, guides: false, pixel: false, vertex: false, segment: false } })),
    setGridSize:     (v) => { if (validGridSpacing(v)) setSettings((s) => ({ ...s, grid: { ...s.grid, sizePx: v } })) },
    setGridVisible:  (v) => setSettings(s => ({ ...s, grid: { ...s.grid, visible: v } })),
    setGridInFront:  (v) => setSettings(s => ({ ...s, grid: { ...s.grid, inFront: v } })),
    setGridSubdivs:  (v) => setSettings((s) => ({ ...s, grid: { ...s.grid, subdivisions: v } })),
    setAngleEnabled: (v) => setSettings((s) => ({ ...s, angle: { ...s.angle, enabled: v } })),
    setAngleStep:    (v) => { if (Number.isFinite(v) && v >= 1 && v <= 180) setSettings((s) => ({ ...s, angle: { ...s.angle, stepDeg: v } })) },
    setScaleEnabled: (v) => setSettings((s) => ({ ...s, scale: { ...s.scale, enabled: v } })),
    setScaleStep:    (v) => { if (Number.isFinite(v) && v >= 1 && v <= 100) setSettings((s) => ({ ...s, scale: { ...s.scale, stepPercent: v } })) },
    resetDefaults:   () => setSettings(DEFAULTS),
  }), [settings])
}
