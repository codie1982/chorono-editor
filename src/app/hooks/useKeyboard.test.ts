import { afterEach, describe, expect, it, vi } from 'vitest'
import { useKeyboard } from './useKeyboard'
import type { ShortcutContext } from '@/lib/shortcuts'

const lifecycle = vi.hoisted(() => ({ cleanup: undefined as (() => void) | undefined }))
vi.mock('react', () => ({ useEffect: (effect: () => (() => void)) => { lifecycle.cleanup = effect() } }))
afterEach(() => { lifecycle.cleanup?.(); vi.unstubAllGlobals() })

function harness(options: { context?: ShortcutContext; nudge?: boolean; active?: boolean } = {}) {
  const listeners = new Map<string, (event: KeyboardEvent) => void>()
  let blockingScope = false
  let scopeVisible = true
  vi.stubGlobal('document', {
    addEventListener: (name: string, listener: (event: KeyboardEvent) => void) => listeners.set(name, listener),
    removeEventListener: (name: string) => listeners.delete(name),
    querySelectorAll: () => blockingScope ? [{ tagName: 'DIV', closest: () => scopeVisible ? null : {},
      getClientRects: () => scopeVisible ? [{}] : [] }] : [],
  })
  let active = options.active ?? true
  const undo = vi.fn(), remove = vi.fn(), copy = vi.fn(), paste = vi.fn()
  const nudge = vi.fn(), stepBack = vi.fn(), stepForward = vi.fn()
  useKeyboard({
    onUndo: undo, onRedo: vi.fn(), onPlayToggle: vi.fn(), onStepBack: stepBack, onStepForward: stepForward,
    onNudgeSelected: options.nudge ? nudge : undefined,
    onDeleteSelected: remove, onDuplicateSelected: vi.fn(), onCopy: copy, onPaste: paste,
    getContext: () => options.context ?? 'timeline', isTransactionActive: () => active,
  })
  const key = (name: string, metaKey = false, tagName = 'DIV', init: {
    shiftKey?: boolean; altKey?: boolean; repeat?: boolean; defaultPrevented?: boolean; isComposing?: boolean;
    contentEditable?: boolean; nestedScope?: boolean;
  } = {}) => {
    const event = { key: name, metaKey, ctrlKey: false, shiftKey: false, altKey: false, ...init,
      target: { tagName, isContentEditable: init.contentEditable ?? false, closest: () => init.nestedScope ? {} : null },
      preventDefault: vi.fn() } as unknown as KeyboardEvent
    listeners.get('keydown')?.(event)
    return event
  }
  return { undo, remove, copy, paste, nudge, stepBack, stepForward, key,
    finishDrag: () => { active = false }, setBlockingScope: (value: boolean, visible = true) => {
      blockingScope = value; scopeVisible = visible
    } }
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

describe('canvas arrow nudging through the shortcut registry', () => {
  it('moves every arrow direction by composition pixels, with Shift selecting ten pixels', () => {
    const h = harness({ context: 'canvas', nudge: true, active: false })
    for (const [key, dx, dy] of [['ArrowLeft', -1, 0], ['ArrowRight', 1, 0], ['ArrowUp', 0, -1], ['ArrowDown', 0, 1]] as const) {
      h.key(key); expect(h.nudge).toHaveBeenLastCalledWith(dx, dy)
      h.key(key, false, 'DIV', { shiftKey: true }); expect(h.nudge).toHaveBeenLastCalledWith(dx * 10, dy * 10)
    }
    expect(h.nudge).toHaveBeenCalledTimes(8)
    expect(h.stepBack).not.toHaveBeenCalled(); expect(h.stepForward).not.toHaveBeenCalled()
  })

  it('preserves timeline frame navigation and legacy hosts without a nudge handler', () => {
    const timeline = harness({ context: 'timeline', nudge: true, active: false })
    timeline.key('ArrowLeft'); timeline.key('ArrowRight', false, 'DIV', { shiftKey: true })
    expect(timeline.stepBack).toHaveBeenCalledWith(1); expect(timeline.stepForward).toHaveBeenCalledWith(10)
    expect(timeline.nudge).not.toHaveBeenCalled()
    const legacy = harness({ context: 'canvas', active: false })
    legacy.key('ArrowLeft', false, 'DIV', { shiftKey: true }); legacy.key('ArrowRight')
    expect(legacy.stepBack).toHaveBeenCalledWith(10); expect(legacy.stepForward).toHaveBeenCalledWith(1)
    expect(legacy.key('ArrowUp').preventDefault).not.toHaveBeenCalled()
  })

  it('leaves typing, native select, dialogs, menus, IME and handled events untouched', () => {
    const h = harness({ context: 'canvas', nudge: true, active: false })
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) expect(h.key('ArrowRight', false, tag).preventDefault).not.toHaveBeenCalled()
    for (const init of [{ contentEditable: true }, { nestedScope: true }, { isComposing: true }, { defaultPrevented: true }]) {
      expect(h.key('ArrowRight', false, 'DIV', init).preventDefault).not.toHaveBeenCalled()
    }
    h.setBlockingScope(true)
    expect(h.key('ArrowRight').preventDefault).not.toHaveBeenCalled()
    expect(h.nudge).not.toHaveBeenCalled()
  })

  it('blocks active drag mutations and reserves modified arrows while allowing deliberate key repeat', () => {
    const h = harness({ context: 'canvas', nudge: true })
    h.key('ArrowRight'); expect(h.nudge).not.toHaveBeenCalled()
    h.finishDrag()
    h.key('ArrowRight', true); h.key('ArrowRight', false, 'DIV', { altKey: true })
    expect(h.nudge).not.toHaveBeenCalled()
    h.key('ArrowRight', false, 'DIV', { repeat: true })
    expect(h.nudge).toHaveBeenCalledExactlyOnceWith(1, 0)
  })

  it('allows canvas movement when retained menu/dialog markup is hidden', () => {
    const h = harness({ context: 'canvas', nudge: true, active: false })
    h.setBlockingScope(true, false)
    h.key('ArrowRight')
    expect(h.nudge).toHaveBeenCalledExactlyOnceWith(1, 0)
    h.setBlockingScope(true, true)
    h.key('ArrowRight')
    expect(h.nudge).toHaveBeenCalledTimes(1)
  })
})
