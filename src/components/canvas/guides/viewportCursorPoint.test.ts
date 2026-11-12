import { describe, expect, it } from 'vitest'
import { isViewportCursorPoint } from './viewportCursorPoint'

/** A tiny DOM-query port keeps eligibility tests independent of React/jsdom.
 * The physical hit target can differ from the pointer-captured event target. */
function workspace() {
  const canvas = { closest: () => null }
  const button = { closest: () => button, hasAttribute: () => false }
  const guide = { closest: () => guide, hasAttribute: (name: string) => name === 'data-guide-id' }
  const outside = { closest: () => null }
  let hit: unknown = canvas
  const blocks: { getBoundingClientRect: () => { left: number; top: number; width: number; height: number } }[] = []
  const container = { isConnected: true,
    getBoundingClientRect: () => ({ left: 100, top: 50, width: 500, height: 400 }),
    ownerDocument: { elementFromPoint: () => hit },
    contains: (node: unknown) => node === canvas || node === button || node === guide,
    querySelectorAll: () => blocks,
  }
  return { container, canvas, button, guide, outside, blocks, hit: (target: unknown) => { hit = target },
    allowed: (x = 250, y = 200) => isViewportCursorPoint(container as unknown as HTMLDivElement, x, y, canvas as unknown as EventTarget) }
}

describe('viewport cursor work-area eligibility', () => {
  it('accepts canvas and empty viewport space independently of artboard bounds', () => {
    const view = workspace()
    expect(view.allowed()).toBe(true)
    // Near viewport edge may lie outside the composition, but remains editable.
    expect(view.allowed(119, 69)).toBe(true); expect(view.allowed(599, 449)).toBe(true)
  })

  it('rejects rulers, all external sides and degenerate/nonfinite samples', () => {
    const view = workspace()
    for (const [x, y] of [[117, 200], [250, 67], [99, 200], [600, 200], [250, 49], [250, 450], [NaN, 200], [250, Infinity]]) {
      expect(view.allowed(x, y)).toBe(false)
    }
    view.container.isConnected = false; expect(view.allowed()).toBe(false)
  })

  it('uses physical hit testing when capture still names the canvas', () => {
    const view = workspace(); view.hit(view.button)
    expect(view.allowed()).toBe(false)
    view.hit(view.canvas); expect(view.allowed()).toBe(true)
    view.hit(view.outside); expect(view.allowed()).toBe(false)
    view.hit(null); expect(view.allowed()).toBe(false)
  })

  it('blocks the whole zoom/HUD rectangle including noninteractive gaps and pointer-transparent chrome', () => {
    const view = workspace()
    view.blocks.push({ getBoundingClientRect: () => ({ left: 240, top: 190, width: 100, height: 35 }) })
    expect(view.allowed()).toBe(false)
    expect(view.allowed(239, 200)).toBe(true)
    expect(view.allowed(340, 200)).toBe(true)
  })

  it('preserves guide-line work surfaces while rejecting other buttons/popovers', () => {
    const view = workspace(); view.hit(view.guide)
    expect(view.allowed()).toBe(true)
    view.hit(view.button); expect(view.allowed()).toBe(false)
  })

  it('rechecks the current layout before a queued sample can be published', () => {
    const view = workspace(); expect(view.allowed()).toBe(true)
    view.blocks.push({ getBoundingClientRect: () => ({ left: 200, top: 150, width: 200, height: 200 }) })
    expect(view.allowed()).toBe(false)
  })
})
