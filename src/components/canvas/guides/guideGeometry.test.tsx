import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { canvasViewportMetrics } from './canvasViewportMetrics'
import { guidePositionInput } from './guidePositionInput'
import { Rulers } from '../overlays/Rulers'
import { guideDragPosition } from './guideDragPosition'

describe('ruler/guide screen geometry', () => {
  it('keeps an off-center existing-guide click stationary and preserves its grab offset while dragging', () => {
    expect(guideDragPosition('v', { x: 103, y: 50 }, { x: 103, y: 50 }, 100)).toBe(100)
    expect(guideDragPosition('v', { x: 103, y: 50 }, { x: 123, y: 70 }, 100)).toBe(120)
    expect(guideDragPosition('h', { x: 103, y: 53 }, { x: 123, y: 73 }, 50)).toBe(70)
    expect(guideDragPosition('v', { x: 103, y: 50 }, { x: 123, y: 70 })).toBe(123)
  })
  it('maps through the actual displayed canvas rectangle instead of assuming zoom or DPR', () => {
    const container = { getBoundingClientRect: () => ({ left: 20, top: 30, width: 900, height: 700 }) } as HTMLElement
    const canvas = { getBoundingClientRect: () => ({ left: 120, top: 160, width: 600, height: 300 }) } as HTMLCanvasElement
    expect(canvasViewportMetrics(container, { width: 1200, height: 600 }, 2, { x: 0, y: 0 }, canvas))
      .toEqual({ width: 900, height: 700, originX: 100, originY: 130, scaleX: .5, scaleY: .5 })
  })
  it('keeps backwards-compatible read-only scales and names pointer/keyboard creation alternatives', () => {
    const container = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) } as HTMLDivElement
    const html = renderToStaticMarkup(<Rulers composition={{ width: 400, height: 300 }} zoom={1} pan={{ x: 0, y: 0 }} containerEl={container}
      cursor={{ x: 100, y: 100 }} onBeginGuide={() => {}} onCreateGuide={() => {}} onManageGuides={() => {}} />)
    for (const name of ['Horizontal ruler', 'Vertical ruler', 'Manage guides']) expect(html).toContain(`aria-label="${name}"`)
    expect(html).toContain('ruler-cursor-x'); expect(html).toContain('ruler-cursor-y'); expect(html).toContain('tabindex="0"')
  })
  it('rejects blank and nonfinite numeric submissions while preserving fractional and negative positions', () => {
    for (const value of ['', ' ', 'NaN', 'Infinity', '10000001']) expect(() => guidePositionInput(value)).toThrow('finite guide position')
    expect(guidePositionInput('-12.25')).toBe(-12.25); expect(guidePositionInput('0')).toBe(0)
  })
})
