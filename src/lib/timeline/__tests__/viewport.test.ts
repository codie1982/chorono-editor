import { describe, expect, it } from 'vitest'
import { clampTimelineScroll, clampTimelineZoom } from '../viewport'
import { clientXToMs, msToPixel } from '../coordinates'

describe('timeline viewport after zoom and resize', () => {
  it('keeps keys visible after zooming out from a far-scrolled position', () => {
    const scroll = clampTimelineScroll(4000, 500, 1)
    expect(scroll).toBe(0)
    expect(msToPixel(500, 1000, 1, 500) - scroll).toBe(250)
    expect(clientXToMs(250, 0, scroll, 1000, 1, 500)).toBe(500)
  })

  it('clamps when the measured track width shrinks', () => {
    expect(clampTimelineScroll(4000, 200, 10)).toBe(1800)
  })

  it('handles sub-fit zoom, invalid input and zoom limits', () => {
    expect(clampTimelineScroll(100, 500, 0.5)).toBe(0)
    expect(clampTimelineScroll(NaN, 500, 2)).toBe(0)
    expect(clampTimelineZoom(0)).toBe(0.25)
    expect(clampTimelineZoom(100)).toBe(20)
    expect(clampTimelineZoom(NaN)).toBe(1)
  })
})
