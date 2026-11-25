import { describe, expect, it, vi } from 'vitest'
import { drawText } from '@/lib/renderer'
import type { Layer } from '@/lib/types'

function fixture(value: string, direction: 'horizontal' | 'vertical' = 'horizontal'): Layer {
  return {
    id: 'text1', name: 'Text', type: 'text',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 },
    opacity: 1,
    text: { value, direction, fontSize: 20, lineHeight: 1.5, color: '#fff' },
  }
}

function context() {
  const fillText = vi.fn()
  const ctx = {
    save: vi.fn(), restore: vi.fn(), fillText, strokeText: vi.fn(), fillRect: vi.fn(),
    measureText: (s: string) => ({ width: s.length * 10 }),
  } as unknown as CanvasRenderingContext2D
  return { ctx, fillText }
}

describe('drawText layout', () => {
  it('draws explicit newlines on separate horizontal baselines', () => {
    const { ctx, fillText } = context()
    drawText(ctx, fixture('first\nsecond'))
    expect(fillText).toHaveBeenCalledWith('first', 0, 0)
    expect(fillText).toHaveBeenCalledWith('second', 0, 30)
  })

  it('draws upright vertical glyphs in right-to-left columns', () => {
    const { ctx, fillText } = context()
    drawText(ctx, fixture('AB\nCD', 'vertical'))
    expect(fillText).toHaveBeenCalledWith('A', 40, 0)
    expect(fillText).toHaveBeenCalledWith('B', 40, 20)
    expect(fillText).toHaveBeenCalledWith('C', 10, 0)
    expect(fillText).toHaveBeenCalledWith('D', 10, 20)
  })

  it('keeps center alignment anchored on the layer origin', () => {
    const { ctx, fillText } = context()
    const layer = fixture('AB')
    layer.text!.textAlign = 'center'
    drawText(ctx, layer)
    expect(fillText).toHaveBeenCalledWith('AB', -10, 0)
  })

  it('keeps center alignment anchored on the layer origin', () => {
    const { ctx, fillText } = context()
    const layer = fixture('AB')
    layer.text!.textAlign = 'center'
    drawText(ctx, layer)
    expect(fillText).toHaveBeenCalledWith('AB', -10, 0)
  })

  it('reads animated letter spacing from timeline overrides', () => {
    const { ctx, fillText } = context()
    drawText(ctx, fixture('AB'), undefined,
      new Map([['layers.text1.text.letterSpacing', 5]]))
    expect(fillText).toHaveBeenCalledWith('A', 0, 0)
    expect(fillText).toHaveBeenCalledWith('B', 15, 0)
  })

  it('reads animated line height from timeline overrides', () => {
    const { ctx, fillText } = context()
    drawText(ctx, fixture('A\nB'), undefined,
      new Map([['layers.text1.text.lineHeight', 2]]))
    expect(fillText).toHaveBeenCalledWith('B', 0, 40)
  })

  it('reads animated line height from timeline overrides', () => {
    const { ctx, fillText } = context()
    drawText(ctx, fixture('A\nB'), undefined,
      new Map([['layers.text1.text.lineHeight', 2]]))
    expect(fillText).toHaveBeenCalledWith('B', 0, 40)
  })
})
