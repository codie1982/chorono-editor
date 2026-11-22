import { describe, it, expect } from 'vitest'
import { SnapEngine, type SnapEngineSettings } from './SnapEngine'

const baseSettings: SnapEngineSettings = {
  enabled: true,
  radiusPx: 6,
  targets: {
    grid: false, objects: true, points: true, guides: true, pixel: false,
    vertex: false, segment: false,
  },
  grid:  { sizePx: 20, subdivisions: 4 },
  angle: { enabled: false, stepDeg: 15 },
  scale: { enabled: false, stepPercent: 5 },
}

const emptyCtx = { canvasWidth: 1000, canvasHeight: 1000, otherLayers: [] }

describe('SnapEngine.snapRect', () => {
  it('returns the input position when snap is master-disabled', () => {
    const e = new SnapEngine({ ...baseSettings, enabled: false })
    const r = e.snapRect({ x: 17.3, y: 42.7, width: 40, height: 30 }, emptyCtx)
    expect(r.snapped).toBe(false)
    expect(r.point).toEqual({ x: 17.3, y: 42.7 })
  })

  it('snaps to canvas centre when the moving rect is within radius', () => {
    // Canvas centre is at (500, 500). A 100×100 rect at (449, y) has its
    // centre at 499 — 1 px shy of the canvas-centre line. Should snap.
    const e = new SnapEngine(baseSettings)
    const r = e.snapRect({ x: 449, y: 100, width: 100, height: 100 }, emptyCtx)
    expect(r.snapped).toBe(true)
    expect(r.point.x).toBe(450)   // centre lands on 500
    expect(r.guides.length).toBeGreaterThan(0)
    expect(r.guides.some(g => g.source === 'canvas-center')).toBe(true)
  })

  it('snaps to grid lattice when grid target is enabled', () => {
    const e = new SnapEngine({
      ...baseSettings,
      radiusPx: 8,
      targets: { ...baseSettings.targets, objects: false, points: false, grid: true },
      grid:    { sizePx: 20, subdivisions: 4 },
    })
    const r = e.snapRect({ x: 44, y: 36, width: 10, height: 10 }, emptyCtx)
    expect(r.point.x).toBe(40)   // nearest multiple of 20
    expect(r.point.y).toBe(40)
  })

  it('leaves the position unchanged when the grid is outside the hit radius', () => {
    const e = new SnapEngine({
      ...baseSettings,
      targets: { ...baseSettings.targets, objects: false, points: false, grid: true },
    })
    expect(e.snapRect({ x: 47, y: 33, width: 10, height: 10 }, emptyCtx).point).toEqual({ x: 47, y: 33 })
  })

  it('rounds to integer pixels when pixel snap is on', () => {
    const e = new SnapEngine({
      ...baseSettings,
      targets: { ...baseSettings.targets, objects: false, points: false, pixel: true },
    })
    const r = e.snapRect({ x: 17.49, y: 42.51, width: 10, height: 10 }, emptyCtx)
    expect(r.point.x).toBe(17)
    expect(r.point.y).toBe(43)
  })

  it('retains a coincident geometric hit when grid and pixel are also enabled', () => {
    // Object snap pulls x to canvas-centre alignment (centre of 100×100 rect
    // lands on 500 → rect.x becomes 450). Grid (size 50) keeps it there
    // since 450 is a multiple of 50. Pixel is irrelevant. Verifies the
    // chain doesn't double-shift.
    const e = new SnapEngine({
      ...baseSettings,
      targets: { ...baseSettings.targets, objects: true, grid: true, pixel: true },
      grid:    { sizePx: 50 },
    })
    const r = e.snapRect({ x: 449, y: 0, width: 100, height: 100 }, emptyCtx)
    expect(r.point.x).toBe(450)
  })
})

describe('SnapEngine.snapTranslationAxis', () => {
  it('keeps a clone moving horizontally when the vertical drift is within snap tolerance', () => {
    const engine = new SnapEngine({ ...baseSettings, radiusPx: 8 })
    expect(engine.snapTranslationAxis({ x: 120, y: 4 })).toEqual({ x: 120, y: 0 })
  })

  it('keeps a clone moving vertically when the horizontal drift is within snap tolerance', () => {
    const engine = new SnapEngine({ ...baseSettings, radiusPx: 8 })
    expect(engine.snapTranslationAxis({ x: 3, y: 90 })).toEqual({ x: 0, y: 90 })
  })

  it('does not axis-snap when the master snap switch is disabled', () => {
    const engine = new SnapEngine({ ...baseSettings, enabled: false })
    expect(engine.snapTranslationAxis({ x: 120, y: 4 })).toEqual({ x: 120, y: 4 })
  })
})

describe('SnapEngine.snapPoint', () => {
  it('is identity when snap disabled', () => {
    const e = new SnapEngine({ ...baseSettings, enabled: false })
    expect(e.snapPoint({ x: 7.3, y: 11.9 })).toEqual({ x: 7.3, y: 11.9 })
  })

  it('snaps to grid when grid target on', () => {
    const e = new SnapEngine({
      ...baseSettings,
      targets: { ...baseSettings.targets, grid: true },
    })
    expect(e.snapPoint({ x: 47, y: 33 })).toEqual({ x: 40, y: 40 })
  })
})

describe('SnapEngine.snapAngle', () => {
  it('is identity when angle snap disabled (BL-28 territory)', () => {
    const e = new SnapEngine(baseSettings)
    expect(e.snapAngle(47.3)).toBe(47.3)
  })

  it('rounds to step when angle snap on', () => {
    const e = new SnapEngine({
      ...baseSettings,
      angle: { enabled: true, stepDeg: 15 },
    })
    expect(e.snapAngle(47)).toBe(45)
    expect(e.snapAngle(53)).toBe(60)
    expect(e.snapAngle(-22)).toBe(-15)
  })
})

describe('SnapEngine.snapScale', () => {
  it('is identity when scale snap disabled (BL-29 territory)', () => {
    const e = new SnapEngine(baseSettings)
    expect(e.snapScale(1.234)).toBe(1.234)
  })

  it('rounds to percent step when scale snap on', () => {
    const e = new SnapEngine({
      ...baseSettings,
      scale: { enabled: true, stepPercent: 5 },  // step = 0.05
    })
    expect(e.snapScale(1.07)).toBeCloseTo(1.05, 5)
    expect(e.snapScale(1.08)).toBeCloseTo(1.10, 5)
    expect(e.snapScale(0.32)).toBeCloseTo(0.30, 5)
  })
})

describe('SnapEngine.setSettings', () => {
  it('hot-swaps the active config without losing the engine instance', () => {
    const e = new SnapEngine(baseSettings)
    expect(e.snapAngle(47)).toBe(47)
    e.setSettings({ ...baseSettings, angle: { enabled: true, stepDeg: 15 } })
    expect(e.snapAngle(47)).toBe(45)
  })
})

describe('independent viewport snapping policies', () => {
  it('disables hidden-grid point/rect snapping without discarding the stored target', () => {
    const settings = { ...baseSettings, targets: { ...baseSettings.targets, objects: false, points: false, grid: true }, grid: { sizePx: 20, visible: false } }
    const engine = new SnapEngine(settings)
    expect(engine.snapPoint({ x: 44, y: 36 })).toEqual({ x: 44, y: 36 })
    expect(engine.snapRect({ x: 44, y: 36, width: 10, height: 10 }, emptyCtx).snapped).toBe(false)
    engine.setSettings({ ...settings, grid: { ...settings.grid, visible: true } })
    expect(engine.snapPoint({ x: 44, y: 36 })).toEqual({ x: 40, y: 40 })
    expect(engine.snapRect({ x: 44, y: 36, width: 10, height: 10 }, emptyCtx).point).toEqual({ x: 40, y: 40 })
    expect(settings.targets.grid).toBe(true)
  })
  it('keeps rotation and scale enabled when Move is disabled, and independently bypasses each', () => {
    const settings = { ...baseSettings, enabled: false, angle: { enabled: true, stepDeg: 45 }, scale: { enabled: true, stepPercent: 10 } }
    const engine = new SnapEngine(settings)
    expect(engine.snapPoint({ x: 44, y: 36 })).toEqual({ x: 44, y: 36 })
    expect(engine.snapAngle(52)).toBe(45)
    expect(engine.snapScale(1.16)).toBeCloseTo(1.2)
    engine.setSettings({ ...settings, angle: { ...settings.angle, enabled: false } })
    expect(engine.snapAngle(52)).toBe(52); expect(engine.snapScale(1.16)).toBeCloseTo(1.2)
    engine.setSettings({ ...settings, scale: { ...settings.scale, enabled: false } })
    expect(engine.snapAngle(52)).toBe(45); expect(engine.snapScale(1.16)).toBe(1.16)
  })
})
