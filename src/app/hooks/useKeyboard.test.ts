import { afterEach, describe, expect, it, vi } from 'vitest'
import { useKeyboard } from './useKeyboard'

const lifecycle = vi.hoisted(() => ({ cleanup: undefined as (() => void) | undefined }))
vi.mock('react', () => ({ useEffect: (effect: () => (() => void)) => { lifecycle.cleanup = effect() } }))
afterEach(() => { lifecycle.cleanup?.(); vi.unstubAllGlobals() })

function harness() {
  const listeners = new Map<string, (event: KeyboardEvent) => void>()
  vi.stubGlobal('document', {
    addEventListener: (name: string, listener: (event: KeyboardEvent) => void) => listeners.set(name, listener),
    removeEventListener: (name: string) => listeners.delete(name),
  })
  let active = true
  const undo = vi.fn(), remove = vi.fn(), copy = vi.fn(), paste = vi.fn()
  useKeyboard({
    onUndo: undo, onRedo: vi.fn(), onPlayToggle: vi.fn(), onStepBack: vi.fn(), onStepForward: vi.fn(),
    onDeleteSelected: remove, onDuplicateSelected: vi.fn(), onCopy: copy, onPaste: paste,
    getContext: () => 'timeline', isTransactionActive: () => active,
  })
  const key = (name: string, metaKey = false, tagName = 'DIV') => {
    const event = { key: name, metaKey, ctrlKey: false, shiftKey: false, altKey: false,
      target: { tagName, isContentEditable: false }, preventDefault: vi.fn() } as unknown as KeyboardEvent
    listeners.get('keydown')?.(event)
    return event
  }
  return { undo, remove, copy, paste, key, finishDrag: () => { active = false } }
}

describe('keyboard commands during an animation drag', () => {
  it('blocks history/deletion/clipboard mutations until the transaction finishes', () => {
    const h = harness()
    h.key('z', true); h.key('Backspace'); h.key('c', true); h.key('v', true)
    expect(h.undo).not.toHaveBeenCalled()
    expect(h.remove).not.toHaveBeenCalled()
    expect(h.copy).not.toHaveBeenCalled()
    expect(h.paste).not.toHaveBeenCalled()
    h.finishDrag()
    h.key('z', true); h.key('Backspace'); h.key('c', true); h.key('v', true)
    expect(h.undo).toHaveBeenCalledTimes(1)
    expect(h.remove).toHaveBeenCalledTimes(1)
    expect(h.copy).toHaveBeenCalledTimes(1)
    expect(h.paste).toHaveBeenCalledTimes(1)
  })

  it('continues to leave input editing and Escape to their own handlers', () => {
    const h = harness()
    h.finishDrag()
    expect(h.key('Backspace', false, 'INPUT').preventDefault).not.toHaveBeenCalled()
    expect(h.remove).not.toHaveBeenCalled()
    expect(h.key('Escape').preventDefault).not.toHaveBeenCalled()
  })
})
