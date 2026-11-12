import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasVisibleKeyboardScope } from './keyboardScope'

afterEach(() => vi.unstubAllGlobals())

/** Small DOM surface adapter; each property is browser-observable visibility,
 * not a duplicate of any selection/keyboard action implementation. */
function scope(options: { hidden?: boolean; rects?: number; nativeDialog?: boolean; open?: boolean } = {}) {
  return { tagName: options.nativeDialog ? 'DIALOG' : 'DIV', closest: () => options.hidden ? {} : null,
    hasAttribute: () => options.open ?? false, getClientRects: () => Array(options.rects ?? 1).fill({}) }
}

describe('visible editor keyboard scopes', () => {
  it('ignores hidden/aria-hidden, display-none, disconnected and closed dialog nodes', () => {
    vi.stubGlobal('document', { querySelectorAll: () => [scope({ hidden: true }), scope({ rects: 0 }), scope({ nativeDialog: true })] })
    expect(hasVisibleKeyboardScope()).toBe(false)
  })
  it('blocks on a visible portalled menu/dialog and ignores absent markup', () => {
    vi.stubGlobal('document', { querySelectorAll: () => [scope({ hidden: true }), scope({ nativeDialog: true, open: true })] })
    expect(hasVisibleKeyboardScope()).toBe(true)
    vi.stubGlobal('document', { querySelectorAll: () => [] })
    expect(hasVisibleKeyboardScope()).toBe(false)
  })
})
