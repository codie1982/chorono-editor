import { describe, expect, it } from 'vitest'
import { SnapEngine, type SnapEngineSettings } from './SnapEngine'

const settings: SnapEngineSettings = { enabled: true, radiusPx: 6, targets: { grid: false, objects: false, points: false, guides: true, pixel: false, vertex: false, segment: false },
  grid: { sizePx: 20 }, angle: { enabled: false, stepDeg: 15 }, scale: { enabled: false, stepPercent: 5 } }

describe('custom guide snap policy', () => {
  it('snaps guide-only moving bounds while object/canvas targets are disabled', () => {
    const engine = new SnapEngine(settings), context = { canvasWidth: 1000, canvasHeight: 1000, otherLayers: [],
      customGuides: [{ id: 'a', axis: 'v' as const, position: 300, locked: true }, { id: 'b', axis: 'h' as const, position: 220 }] }
    const snap = engine.snapRect({ x: 222, y: 223, width: 80, height: 50 }, context)
    expect(snap.point).toEqual({ x: 220, y: 220 }); expect(snap.guides.every(guide => guide.source === 'custom-guide')).toBe(true)
    expect(engine.snapRect({ x: 449, y: 100, width: 100, height: 100 }, { ...context, customGuides: [] }).point.x).toBe(449)
  })
  it('excludes hidden lines and honors the guide target toggle independently of object settings', () => {
    const context = { canvasWidth: 1000, canvasHeight: 1000, otherLayers: [], customGuides: [{ id: 'a', axis: 'v' as const, position: 300, hidden: true }] }
    expect(new SnapEngine(settings).snapRect({ x: 222, y: 100, width: 80, height: 50 }, context).point.x).toBe(222)
    const engine = new SnapEngine({ ...settings, targets: { ...settings.targets, guides: false } })
    expect(engine.snapRect({ x: 222, y: 100, width: 80, height: 50 }, { ...context, customGuides: [{ ...context.customGuides[0], hidden: false }] }).point.x).toBe(222)
  })
})
