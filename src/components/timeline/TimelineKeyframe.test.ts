import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import TimelineKeyframe from './TimelineKeyframe'

function keyframe() {
  const onSelect = vi.fn()
  const props = {
    kf: { id: 'key', timeMs: 250, value: 1, easing: { type: 'linear' as const } },
    x: 100, isSelected: false, onSelect, onDelete() {}, onSetEasing() {}, onPointerDown() {},
  }
  return { props, onSelect, element: TimelineKeyframe(props) }
}

describe('timeline keyframe focus and click routing', () => {
  it('is focusable so pointer selection can leave the filter input', () => {
    const { props } = keyframe()
    const html = renderToStaticMarkup(createElement(TimelineKeyframe, props))
    expect(html).toMatch(/data-kf-id="key"[^>]*tabindex="0"[^>]*role="button"/)
  })

  it('does not toggle selection again for the native click after pointerup', () => {
    const { element, onSelect } = keyframe()
    element.props.onClick({ detail: 1, shiftKey: false, stopPropagation: vi.fn() })
    expect(onSelect).not.toHaveBeenCalled()
    element.props.onClick({ detail: 0, shiftKey: true, stopPropagation: vi.fn() })
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(true)
  })

  it('supports keyboard selection without stealing tooltip control keys', () => {
    const { element, onSelect } = keyframe()
    const target = {}
    element.props.onKeyDown({ key: 'Enter', target, currentTarget: target, shiftKey: false, preventDefault: vi.fn(), stopPropagation: vi.fn() })
    element.props.onKeyDown({ key: 'Enter', target: {}, currentTarget: target, shiftKey: false })
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(false)
  })
})
