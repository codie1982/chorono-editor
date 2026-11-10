import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { parseSceneJson } from '@/lib/format/scene/SceneJsonConverter'
import { evaluateNumericTrack } from '@/lib/evaluator'

/** Settle real React state/layout between visible production controls. */
async function frames() { for (let i = 0; i < 10; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve())) }
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }

/** Source reads assert invariants only; actual controls author every edit. */
export async function checkProcedural(editor: EditorStateReturn) {
  const results: { name: string; passed: boolean; error?: string }[] = []
  const source = () => JSON.stringify(editor.getScene()), graph = document.querySelector<HTMLElement>('[data-panel="Curve"]')!
  const track = () => editor.getScene().timelines[0].tracks.find(track => track.target === 'layers.hero.transform.x')!
  const action = async (name: string) => { document.querySelector<HTMLButtonElement>(`[data-action="${name}"]`)!.click(); await frames() }
  const button = (root: ParentNode, name: string) => {
    const node = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(item => item.getAttribute('aria-label') === name || item.textContent?.trim() === name)
    assert(node, `Missing button ${name}`); return node
  }
  const click = async (root: ParentNode, name: string) => { const node = button(root, name); assert(!node.disabled, `${name} disabled`); node.click(); await frames() }
  const input = async (root: ParentNode, label: string, value: string) => {
    const node = root.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
    assert(node, `Missing input ${label}`); node.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, value)
    node.dispatchEvent(new Event('input', { bubbles: true })); await frames(); return node
  }
  const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!
  const bake = () => click(graph, 'Bake transform.x')
  const key = async (node: HTMLElement, value: string) => { node.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })); await frames() }
  const check = async (name: string, run: () => Promise<void>) => {
    try { await action('reset'); await run(); results.push({ name, passed: true }) }
    catch (error) { results.push({ name, passed: false, error: String(error) }) }
  }
  await check('zero-key waveform is visible and evaluated without writing synthetic keys or changing manual clock', async () => {
    const before = source(), revision = editor.getRevision()
    assert(track().keyframes.length === 0 && graph.textContent?.includes('waveform'), 'Zero-key controller hidden')
    assert(graph.querySelector('[data-curve-target="layers.hero.transform.x"] path')?.getAttribute('d')?.includes('L'), 'Evaluated waveform path missing')
    assert(Math.abs(Number(document.querySelector<HTMLElement>('#procedural-state')!.dataset.x) - (100 + 50 * Math.sin(1))) < 1e-8, 'Displayed frame disagrees with sin(2t)')
    assert(editor.getScene().timelines[0].layerIds?.includes('hero'), 'track() did not ensure membership')
    assert(editor.getScene().layers.find(layer => layer.id === 'clock')?.text?.value === '09:05', 'Manual clock changed')
    assert(source() === before && editor.getRevision() === revision, 'Graph preview authored source')
  })
  await check('bake preview rejects invalid FPS, compares actual paths and Cancel has no source/history effect', async () => {
    const before = source(), revision = editor.getRevision(); await bake()
    await input(dialog(), 'Samples / second', '0'); await click(dialog(), 'Preview bake')
    assert(dialog().querySelector('[role="alert"]')?.textContent?.includes('FPS'), 'Invalid FPS not explained')
    assert(button(dialog(), 'Apply bake').disabled, 'Invalid preview can commit')
    await input(dialog(), 'Samples / second', '60'); await click(dialog(), 'Preview bake')
    assert(dialog().querySelector('svg[aria-label*="Source blue"] path[d*="L"]'), 'Comparison preview missing')
    await click(dialog(), 'Cancel'); assert(source() === before && editor.getRevision() === revision, 'Cancel changed source or history')
  })
  await check('Apply creates editable keys within measured accuracy, one undo/redo and portable source retains manual data', async () => {
    const before = source(), original = structuredClone(track()), unrelated = JSON.stringify(editor.getScene().timelines[0].tracks[1])
    await bake(); await click(dialog(), 'Preview bake'); await click(dialog(), 'Apply bake')
    assert(!track().controller && track().keyframes.length > 2, 'Controller was not converted')
    for (const time of [0, 117, 500, 999, 2345, 3000]) assert(Math.abs(evaluateNumericTrack(original, time)! - evaluateNumericTrack(track(), time)!) < 1, 'Baked error exceeded representative tolerance')
    assert(JSON.stringify(editor.getScene().timelines[0].tracks[1]) === unrelated, 'Manual unrelated keys/easing changed')
    const committed = source(); assert(JSON.stringify(parseSceneJson(committed, true)) === committed, 'Portable source differs')
    await action('undo'); assert(source() === before, 'Bake is not one exact undo')
    await action('redo'); assert(source() === committed, 'Redo changed prepared key identities')
  })
  await check('an external source edit invalidates a prepared bake without overwriting it', async () => {
    await bake(); await click(dialog(), 'Preview bake'); await action('external'); const manual = source()
    assert(button(dialog(), 'Apply bake').disabled && dialog().textContent?.includes('Source changed'), 'Stale preview not blocked')
    await click(dialog(), 'Cancel'); assert(source() === manual, 'Cancel reverted external manual edit')
  })
  await check('Wire preview uses actual evaluated source; arithmetic errors cannot apply and valid commit has one undo', async () => {
    const before = source(); await action('wire')
    assert(dialog().textContent?.includes('42.00'), 'Preview read static source instead of evaluated 42')
    await input(dialog(), 'Wire expression', '1/0'); assert(button(dialog(), 'Apply Changes').disabled, 'Null/non-finite expression can apply')
    assert(dialog().querySelector('[role="alert"]')?.textContent?.includes('Division by zero'), 'Evaluation failure has no reason')
    await input(dialog(), 'Wire expression', '2+3+source'); await click(dialog(), 'Apply Changes')
    assert(Number(document.querySelector<HTMLElement>('#procedural-state')!.dataset.rotation) === 47, 'Runtime/preview arithmetic differ')
    await action('undo'); assert(source() === before, 'Wire edit lost original keys/metadata')
  })
  await check('cycles are explained in UI and retain the frame input fallback', async () => {
    await action('cycle'); assert(button(dialog(), 'Apply Changes').disabled, 'Cycle can apply')
    assert(dialog().textContent?.includes('cycle'), 'Cycle reason missing')
    await click(dialog(), 'Cancel'); assert(document.querySelector('[data-panel="Curve"]'), 'Curve disappeared at wire failure')
    assert(!document.querySelector<HTMLElement>('#procedural-state')!.dataset.rotation, 'Cyclic wire wrote an override')
  })
  await check('inline expression refuses invalid commit, Escape cancels, and source alias commits once', async () => {
    let node = await input(document, 'Expression', 'sqrt(-1)'); await key(node, 'Enter'); node.blur(); await frames()
    const state = () => document.querySelector<HTMLElement>('#procedural-state')!
    assert(state().dataset.commits === '0', 'Invalid inline expression committed')
    node = await input(document, 'Expression', 'source+999'); await key(node, 'Escape')
    assert(state().dataset.commits === '0' && node.value === 'source', 'Escape blur committed cancelled draft')
    node = await input(document, 'Expression', 's+2'); await key(node, 'Enter'); node.blur(); await frames()
    assert(state().dataset.commits === '1' && state().dataset.inline === 's+2', 'Valid inline expression did not commit once')
  })
  await action('reset')
  return { passed: results.every(result => result.passed), results }
}
