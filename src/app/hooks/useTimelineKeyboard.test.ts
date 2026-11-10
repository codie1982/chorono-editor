import { afterEach, describe, expect, it, vi } from 'vitest'
import { useKeyboard } from './useKeyboard'
import { registerScopedActions } from '@/lib/shortcuts/scopedActions'

const lifecycle = vi.hoisted(() => ({ cleanup: undefined as (() => void) | undefined }))
vi.mock('react', () => ({ useEffect: (effect: () => (() => void)) => { lifecycle.cleanup = effect() } }))
afterEach(() => { lifecycle.cleanup?.(); vi.unstubAllGlobals() })

/** Real registry + central listener; native target, portal, drag and repeat
 * conditions are independent of React rendering or a particular keyboard. */
function harness() {
  let listener: (event: KeyboardEvent) => void = () => {}, busy = false, portal = false
  const setKey = vi.fn(), navigate = vi.fn(), play = vi.fn()
  vi.stubGlobal('document', { addEventListener: (_: string, value: typeof listener) => { listener = value }, removeEventListener() {},
    querySelectorAll: () => portal ? [{ tagName: 'DIV', closest: () => null, getClientRects: () => [{}] }] : [] })
  useKeyboard({ onUndo() {}, onRedo() {}, onPlayToggle: play, onStepBack() {}, onStepForward() {},
    onDeleteSelected() {}, onDuplicateSelected() {}, onSetKey: setKey, onTimelineNavigate: navigate,
    getContext: () => 'timeline', isTransactionActive: () => busy })
  const key = (name: string, options: Partial<KeyboardEvent> = {}, tagName = 'DIV') => {
    const event = { key: name, altKey: false, shiftKey: false, ctrlKey: false, metaKey: false, repeat: false,
      target: { tagName, closest: () => null, isContentEditable: false }, preventDefault: vi.fn(), ...options } as unknown as KeyboardEvent
    listener(event); return event
  }
  return { key, setKey, navigate, play, busy: (value: boolean) => { busy = value }, portal: (value: boolean) => { portal = value } }
}

describe('central timeline keyboard workflow', () => {
  it('dispatches Set Key once, with comma/period and Home/End from the same navigation contract', () => {
    const h = harness(); h.key('k'); h.key('k', { repeat: true }); h.key(','); h.key('.'); h.key('Home'); h.key('End'); h.key('Home', { shiftKey: true }); h.key('End', { shiftKey: true })
    expect(h.setKey).toHaveBeenCalledTimes(1)
    expect(h.navigate.mock.calls.map(call => call[0])).toEqual(['previousKey', 'nextKey', 'start', 'end', 'firstKey', 'lastKey'])
    h.key('ArrowLeft'); h.key('ArrowRight', { shiftKey: true })
    expect(h.navigate).toHaveBeenLastCalledWith('nextFrame', 10)
  })
  it('leaves native form controls, composition, consumed events and active drag untouched', () => {
    const h = harness()
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) h.key('k', {}, tag)
    h.key('k', { isComposing: true }); h.key('k', { defaultPrevented: true })
    h.busy(true); h.key('k'); h.key('.')
    expect(h.setKey).not.toHaveBeenCalled(); expect(h.navigate).not.toHaveBeenCalled()
  })
  it('blocks behind presented portals and leaves button Space to native activation', () => {
    const h = harness(); h.portal(true); h.key('k'); h.key('End'); h.key(' ')
    expect(h.setKey).not.toHaveBeenCalled(); expect(h.navigate).not.toHaveBeenCalled(); expect(h.play).not.toHaveBeenCalled()
    h.portal(false); expect(h.key(' ', {}, 'BUTTON').preventDefault).not.toHaveBeenCalled()
    h.key(' '); expect(h.play).toHaveBeenCalledTimes(1)
  })
  it('dispatches presented panel-local commands once without a hover listener and disposes them', () => {
    const h = harness(), marker = vi.fn(), dispose = registerScopedActions({ 'timeline.marker.next': marker }, () => true)
    h.key(']'); expect(marker).toHaveBeenCalledTimes(1); dispose(); h.key(']'); expect(marker).toHaveBeenCalledTimes(1)
    const hidden = registerScopedActions({ 'timeline.marker.next': marker }, () => false)
    h.key(']'); expect(marker).toHaveBeenCalledTimes(1); hidden()
  })
})
