/** Dense source cases use the real public test-page controls and native key
 * handlers. No DOM-count exception is made for select-all or coincident keys.
 * Trusted pointer capture, value/easing and cancel are checked separately in
 * the browser; synthetic keyboard events intentionally exercise keyboard code. */
export async function runGlyphChecks(document: Document) {
  const pane = document.querySelector<HTMLElement>('#ui-pane')!
  const action = async (name: string) => {
    document.querySelector<HTMLButtonElement>(`[data-action="${name}"]`)!.click(); await frames()
  }
  const view = async (name: string) => {
    Array.from(document.querySelectorAll<HTMLButtonElement>('[data-switch-view]')).find(button => button.dataset.switchView === name)!.click()
    await frames()
  }
  const state = () => JSON.parse(document.querySelector('#ui-state')!.textContent!)
  const nativeCount = () => pane.querySelectorAll('[data-kf-id],[data-key-id]').length
  const key = (name: string, shiftKey = false) => {
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true, cancelable: true }))
  }
  await view('Timeline'); await action('glyphs')
  assert(state().keyCount === 42000, '42000-key source was not loaded')
  assert(nativeCount() <= 3 && pane.querySelector('[data-key-glyph-layer="dense"]'), 'Dense controls grew with source count')
  const initial = nativeCount(), cells = Number(pane.querySelector('[data-glyph-cells]')!.getAttribute('data-glyph-cells'))
  await action('all')
  assert(state().selectedKeys === 42000 && nativeCount() <= 3, 'Select-all expanded controls or lost keys')
  await action('clear')
  const control = pane.querySelector<HTMLElement>('[data-kf-id]')!
  control.focus({ preventScroll: true }); key('Home'); await frames()
  assert((document.activeElement as HTMLElement).dataset.kfId === 'ui-key-0', 'Home cannot reach first source key')
  key('End'); await frames()
  assert((document.activeElement as HTMLElement).dataset.kfId === 'ui-key-41999', 'End cannot reach last source key')
  key('Enter'); await frames()
  assert(state().selectedKeys === 1, 'Native keyboard selection did not select exactly one key')
  key('ArrowLeft'); await frames(); key(' ', true); await frames()
  assert(state().selectedKeys === 2, 'Shift selection lost native semantics')

  await action('overlap')
  assert(nativeCount() <= 3 && Number(pane.querySelector('[data-glyph-cells]')!.getAttribute('data-glyph-cells')) === 1, 'Coincident source was not coalesced')
  const overlap = pane.querySelector<HTMLElement>('[data-kf-id]')!
  overlap.focus({ preventScroll: true }); key('Home'); await frames(); key('Enter'); await frames()
  assert(state().selectedKeys === 1 && (document.activeElement as HTMLElement).dataset.kfId === 'ui-key-0', 'Buried coincident key is inaccessible')

  await view('Dope Sheet'); await action('glyphs')
  assert(nativeCount() <= 15, `Dope controls: ${nativeCount()}`)
  assert(pane.querySelectorAll('.keyframe-segment').length <= 1, 'Dope segment DOM grew with key count')
  const dope = nativeCount()
  await action('all')
  assert(state().selectedKeys === 42000 && nativeCount() <= 15, 'Dope select-all expanded controls')
  await action('overlap')
  assert(nativeCount() <= 6 && pane.querySelectorAll('.keyframe-segment').length === 0, 'Zero-length coincident segments grew DOM')

  await view('Timeline'); await action('audio-keys')
  assert(state().keyCount === 42000 && nativeCount() <= 6, `Audio controls: ${nativeCount()}`)
  const audio = nativeCount()
  const gain = pane.querySelector<HTMLElement>('[data-audio-clip] [data-kf-id]')!
  gain.focus({ preventScroll: true }); key('Home'); await frames(); key('End'); await frames()
  assert((document.activeElement as HTMLElement).dataset.kfId === 'ui-key-41999', 'Audio gain key navigation lost source identity')
  await action('restore')
  return { sourceKeys: 42000, timelineNative: initial, timelineCells: cells, dopeNative: dope, audioNative: audio,
    coincidentCellCount: 1, selectionAndKeyboard: true }
}

/** Fixed bounded layout turns; no production timer/observer is installed. */
async function frames() {
  for (let i = 0; i < 5; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
}
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
