import { describe, expect, it } from 'vitest'
import { SnapEngine, type SnapEngineSettings } from './SnapEngine'

const base: SnapEngineSettings = { enabled: true, radiusPx: 6,
  targets: { objects: false, parent: false, points: false, grid: false, guides: false, pixel: false, vertex: false, segment: false },
  grid: { sizePx: 20 }, angle: { enabled: false, stepDeg: 15 }, scale: { enabled: false, stepPercent: 5 } }
const context = { canvasWidth: 1000, canvasHeight: 1000, otherLayers: [{ id: 'edge', x: 45, y: 900, width: 100, height: 80 }],
  parentBounds: [{ x: 100, y: 200, width: 500, height: 300 }] }
const engine = (targets: Partial<SnapEngineSettings['targets']>) => new SnapEngine({ ...base, targets: { ...base.targets, ...targets } })

describe('simultaneous pointer and bounds snap targets', () => {
  it('uses a closer object edge on X and the grid on Y without a later overwrite', () => {
    const result = engine({ grid: true, objects: true }).resolvePoint({ x: 46, y: 76 }, context)
    expect(result.point).toEqual({ x: 45, y: 80 })
    expect(result.guides.map(guide => guide.source)).toEqual(['layer-edge', 'grid'])
  })
  it('acquires only parent edges when selected, independently of object/point toggles', () => {
    expect(engine({ parent: true }).resolvePoint({ x: 96, y: 196 }, context).point).toEqual({ x: 100, y: 200 })
    expect(engine({}).resolvePoint({ x: 96, y: 196 }, context).point).toEqual({ x: 96, y: 196 })
  })
  it('distinguishes center points from edges and keeps disabled targets excluded', () => {
    expect(engine({ points: true }).resolvePoint({ x: 93, y: 800 }, context).point.x).toBe(95)
    expect(engine({ objects: true }).resolvePoint({ x: 93, y: 800 }, context).point.x).toBe(93)
    expect(engine({ grid: true }).resolvePoint({ x: 47, y: 33 }, context).point).toEqual({ x: 47, y: 33 })
  })
  it('keeps acquisition radius in CSS pixels through zoom', () => {
    expect(engine({ parent: true }).resolvePoint({ x: 95, y: 196 }, { ...context, zoom: 2 }).point).toEqual({ x: 95, y: 196 })
    expect(engine({ parent: true }).resolvePoint({ x: 95, y: 196 }, { ...context, zoom: .5 }).point).toEqual({ x: 100, y: 200 })
  })
  it('does not quantize an exact fractional geometric hit with pixel fallback', () => {
    const snap = new SnapEngine({ ...base, targets: { ...base.targets, grid: true, pixel: true }, grid: { sizePx: 12.75 } })
    expect(snap.resolvePoint({ x: 24.7, y: 38.4 }, context).point).toEqual({ x: 25.5, y: 38.25 })
  })
  it('prefers explicit parent bounds on equal-distance ties and restores identity when disabled', () => {
    const snap = engine({ grid: true, parent: true })
    expect(snap.resolvePoint({ x: 98, y: 198 }, context).guides.map(guide => guide.source)).toEqual(['parent-edge', 'parent-edge'])
    snap.setSettings({ ...base, enabled: false, targets: { ...base.targets, grid: true, parent: true } })
    expect(snap.resolvePoint({ x: 98, y: 198 }, context)).toMatchObject({ point: { x: 98, y: 198 }, snapped: false, guides: [] })
  })
})
