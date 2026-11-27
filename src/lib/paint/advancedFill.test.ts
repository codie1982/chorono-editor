import { describe, expect, it } from 'vitest'
import { gradientStops } from './gradientStops'
import { withSplineFillChoice, splineFillChoice } from './splineFillChoice'
import { GradientRegistry } from '../export/vector/SVGStyleBuilder'
import { emptyScene, newSplineLayerFromData } from '../defaults'
import { createCircleSpline } from '../spline'
import { parseSceneJson } from '../format/scene/SceneJsonConverter'
import type { GradientFill } from '../types'
const gradient: GradientFill = { type: 'linear', angle: 30, stops: [{ offset: 0, color: '#ff000080', opacity: 50 }, { offset: 1, color: '#0000ff' }] }
describe('Spline advanced fill contract', () => {
  it.each(['gradient', 'radial', 'angle', 'reflected', 'diamond'] as const)('retains authored stops/alpha when selecting %s and round-trips portable source', choice => {
    const fill = { type: 'gradient' as const, gradient, opacity: 40 }, saved = structuredClone(fill)
    const next = withSplineFillChoice(fill, choice)
    expect(splineFillChoice(next)).toBe(choice); expect(next.gradient!.stops).toBe(gradient.stops)
    expect(fill).toEqual(saved)
    const layer = newSplineLayerFromData(createCircleSpline({ radius: 40 })); layer.style = { ...layer.style, fill: next }
    expect(parseSceneJson(JSON.stringify({ ...emptyScene(), layers: [layer] })).layers[0].style?.fill).toEqual(next)
  })
  it('multiplies stop alpha and creates stable mirrored stops around the center', () => {
    const stops = gradientStops({ ...gradient, type: 'reflected' })
    expect(stops.map(stop => stop.offset)).toEqual([0, .5, .5, 1])
    expect(stops[1].color).toBe('rgba(255,0,0,0.25098)')
    expect(stops[1].color).toBe(stops[2].color)
    expect(gradient.stops[0].color).toBe('#ff000080')
  })
  it('uses repeating image paint for Pattern and preserves placement across None', () => {
    const fill = withSplineFillChoice(undefined, 'pattern')
    expect(fill.image).toMatchObject({ repeat: true, fit: 'contain', scale: .25 })
    const off = withSplineFillChoice(fill, 'none'), restored = withSplineFillChoice(off, 'pattern')
    expect(restored.image).toEqual(fill.image)
    expect(withSplineFillChoice(restored, 'image').image?.repeat).toBe(false)
  })
  it('exports exact native Diamond quadrants and discloses Angle SVG approximation', () => {
    const registry = new GradientRegistry(), box = { x: -60, y: -40, width: 120, height: 80 }
    registry.register({ ...gradient, type: 'diamond' }, box)
    expect(registry.toDefs().match(/linearGradient id=/g)).toHaveLength(4)
    expect(registry.toDefs()).toContain('patternUnits="userSpaceOnUse"')
    registry.register({ ...gradient, type: 'angle' }, box)
    expect(registry.toDefs().match(/<polygon /g)).toHaveLength(720)
    expect(registry.warnings).toHaveLength(1)
    registry.register({ ...gradient, type: 'angle' }, box)
    expect(registry.warnings).toHaveLength(1)
  })
})
