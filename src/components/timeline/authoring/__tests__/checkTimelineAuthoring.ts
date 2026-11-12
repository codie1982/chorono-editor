import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { parseSceneJson } from '@/lib/format/scene/SceneJsonConverter'

/** Let layout, React effects and virtualization settle between real controls. */
async function frames() { for (let i = 0; i < 8; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve())) }
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }

/** Production DOM workflow over an isolated source/history owner. The normal
 * app controls execute edits; source reads assert invariants and never mutate.
 * A failing case is reported separately so later independent checks still run. */
export async function checkTimelineAuthoring(editor: EditorStateReturn) {
  const results: { name: string; passed: boolean; error?: string }[] = []
  const panel = document.querySelector<HTMLElement>('[data-panel="Timeline"]')!
  const source = () => JSON.stringify(editor.getScene())
  const keys = () => editor.getScene().timelines[0].tracks.find(track => track.target === 'layers.hero-0.transform.x')!.keyframes
  const state = () => document.querySelector<HTMLElement>('#authoring-state')!
  const time = () => Number(state().dataset.time)
  const button = (root: ParentNode, text: string) => {
    const node = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent?.trim() === text || item.getAttribute('aria-label') === text || item.title === text)
    assert(node, `Missing button: ${text}`); return node
  }
  const click = async (root: ParentNode, text: string) => { button(root, text).click(); await frames() }
  const slide = async () => {
    const node = panel.querySelector<HTMLButtonElement>('button[title^="Slide selected keyframes forward"]')!
    assert(node, 'Slide button missing'); node.click(); await frames()
  }
  const action = async (name: string) => { document.querySelector<HTMLButtonElement>(`[data-action="${name}"]`)!.click(); await frames() }
  const choose = async (value: string) => {
    const trigger = panel.querySelector<HTMLButtonElement>('[aria-label="Set Key"] button')!
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })); await frames()
    const labels: Record<string, string> = { all: 'All supported channels', transform: 'Transform + opacity', animated: 'Existing animated channels', selected: 'Selected key channels' }
    const option = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menu"] button')).find(item => item.textContent?.replace(/^✓ /, '') === labels[value])!
    assert(option, 'Keyset option missing'); option.click(); await frames()
  }
  const setKey = async () => {
    const button = panel.querySelector<HTMLButtonElement>('[aria-label="Set Key"] button')!
    assert(!button.disabled, 'Set Key is disabled'); button.click(); await frames()
  }
  const setInput = async (element: HTMLInputElement, value: string) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true })); await frames()
  }
  const keyboard = async (key: string, options: KeyboardEventInit = {}, target: Element = panel) => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options })); await frames()
  }
  const check = async (name: string, run: () => Promise<void>) => {
    try { await action('reset'); await run(); results.push({ name, passed: true }) }
    catch (error) { results.push({ name, passed: false, error: String(error) }) }
  }
  await frames()
  await check('Set Key samples 50 at the intermediate frame, keeps manual identity/easing and uses one undo/redo', async () => {
    await choose('animated'); const before = source(), original = keys().map(key => ({ ...key }))
    await setKey()
    assert(keys().find(key => key.timeMs === 500)?.value === 50, 'Set Key wrote the static base instead of interpolation')
    for (const key of original) assert(JSON.stringify(keys().find(item => item.id === key.id)) === JSON.stringify(key), 'An original key/easing/tangent changed')
    const committed = source(); await action('undo'); assert(source() === before, 'Set Key required multiple undos or lost attribution')
    await action('redo'); assert(source() === committed, 'Redo regenerated IDs/metadata')
    assert(JSON.stringify(parseSceneJson(source(), true)) === source(), 'Portable JSON changed source/identity')
  })
  await check('50 selected layers get a bounded keyset with membership in one undo, preserving manual clock and source geometry', async () => {
    await action('all-layers'); const before = source(), old = editor.getScene()
    await setKey(); const next = editor.getScene()
    assert(next.timelines[0].layerIds?.filter(id => id.startsWith('hero-')).length === 50, 'Membership skipped selected objects')
    assert(next.layers === old.layers, 'Key command changed source transforms/names')
    assert(next.layers.find(layer => layer.id === 'clock')?.text?.value === '09:05', 'Manual clock changed')
    await action('undo'); assert(source() === before, '50-layer operation was not one undo')
    assert(panel.querySelectorAll('[data-virtual-row]').length < 90, 'Set Key disabled virtualization')
  })
  await check('driven channels are reviewed before partial apply; cancel leaves all manual source untouched', async () => {
    await choose('animated'); await action('controller'); const before = source()
    await setKey(); assert(source() === before, 'Partial keys committed without review')
    assert(panel.textContent?.includes('skipped'), 'Skipped channels were not explained')
    await click(panel, 'Cancel'); assert(source() === before, 'Cancel changed source')
    await setKey(); await click(panel, 'Set supported keys')
    assert(keys().length === 3, 'Driven channel received ineffective keys')
    const other = editor.getScene().timelines[0].tracks.find(track => track.target === 'layers.hero-1.transform.x')!
    assert(other.keyframes.some(key => key.timeMs === 500), 'Supported channel was not applied')
    await action('undo'); assert(source() === before, 'Partial apply undo lost controller/manual state')
  })
  await check('bulk collision rejects the complete operation; explicit overwrite and undo preserve original keys', async () => {
    await action('first-key'); const before = source()
    await slide(); assert(source() === before, 'Slide silently overwrote another key')
    const overwrite = panel.querySelector<HTMLInputElement>('label[title*="Replace untouched"] input')!
    overwrite.click(); await frames(); await slide()
    assert(keys().length === 2 && keys().find(key => key.id === 'hero-0-key-0')?.timeMs === 100, 'Explicit overwrite not applied')
    await action('undo'); assert(source() === before, 'Overwrite undo did not restore removed key')
  })
  await check('bulk slide preserves spacing and payload across a selected pair in one undo', async () => {
    await action('pair'); const before = source(); await slide()
    assert(keys().find(key => key.id === 'hero-0-key-0')?.timeMs === 100 && keys().find(key => key.id === 'hero-0-key-1')?.timeMs === 200, 'Selected interval was compressed or moved sequentially')
    await action('undo'); assert(source() === before, 'Pair slide undo differs')
  })
  await check('spreadsheet keeps exact fractional time and Escape cancels a draft without blur commit', async () => {
    await action('first-key'); await click(panel, '⊞ Sheet'); const before = source()
    const row = panel.querySelector('table tbody tr')!; assert(row, 'Spreadsheet row missing')
    await click(row, '0')
    let input = row.querySelector<HTMLInputElement>('input')!; await setInput(input, '250.25'); await keyboard('Escape', {}, input)
    assert(source() === before, 'Escape committed its draft')
    await click(row, '0'); input = row.querySelector<HTMLInputElement>('input')!; await setInput(input, '250.25'); await keyboard('Enter', {}, input)
    assert(keys().find(key => key.id === 'hero-0-key-0')?.timeMs === 250.25, 'Spreadsheet rounded a fractional key')
    await action('undo'); assert(source() === before, 'Spreadsheet undo lost source')
  })
  await check('clipboard rejects out-of-range paste atomically and successful paste has one undo', async () => {
    await action('pair'); await action('copy'); await click(panel, 'Timeline end (End)'); const before = source()
    await action('paste'); assert(source() === before, 'Paste left a partial insertion at the duration boundary')
    await action('seek500'); await action('paste')
    assert(keys().some(key => key.timeMs === 500) && keys().some(key => key.timeMs === 600), 'Paste did not preserve relative timing')
    await action('undo'); assert(source() === before, 'Paste required more than one undo')
  })
  await check('rejected gesture restores the baseline and closes its transaction, including attribution', async () => {
    const before = source(); await action('rejected-gesture')
    assert(source() === before && !editor.isTransactionActive(), 'Rejected commit kept its preview or transaction')
  })
  await check('manual transport reaches loop terminal pose outside work area, with one central key navigation action', async () => {
    const before = source(); await click(panel, 'Timeline end (End)')
    assert(time() === 1000 && Number(state().dataset.evaluatedX) === 100, 'Terminal manual frame wrapped to playback origin')
    await click(panel, 'Timeline start (Home)'); assert(time() === 0, 'Work area constrained manual start')
    const seeks = Number(state().dataset.seeks); await keyboard('.')
    assert(time() === 100 && Number(state().dataset.seeks) === seeks + 1, 'Hover listener duplicated navigation')
    await keyboard('End', { shiftKey: true }); assert(time() === 1000, 'Last key navigation wrong')
    assert(source() === before, 'Navigation edited source')
  })
  await check('K uses the current keyset once, and inputs/dialogs/native Play own their keyboard', async () => {
    await choose('animated'); const revision = editor.getRevision()
    await keyboard('k'); await keyboard('k', { repeat: true })
    assert(editor.getRevision() === revision + 1, 'Repeated K wrote extra history')
    const committed = source(), input = panel.querySelector<HTMLInputElement>('input[placeholder="Filter layers…"]')!
    await keyboard('k', {}, input); assert(source() === committed, 'Typing K in an input wrote keys')
    await action('dialog'); await keyboard('k'); assert(source() === committed, 'K edited behind a dialog')
    await click(document, 'Close dialog')
    const play = button(panel, 'Play / Pause (Space) · long-press for play mode')
    await keyboard(' ', {}, play); assert(state().textContent?.includes('Playing'), 'Play toggled twice or ignored native keyboard')
  })
  await action('reset'); await choose('animated'); await setKey()
  return { passed: results.every(result => result.passed), results, layers: editor.getScene().layers.length }
}
