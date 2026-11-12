import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { createLayerWorldBoundsResolver } from '@/lib/geometry/resolveLayerWorldBounds'

/** Allow React layout and virtualized scrolling to finish after actual controls. */
async function frames() { for (let i = 0; i < 12; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve())) }
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }

/** Production controls perform every operation; source reads prove that Find
 * and isolation cannot overwrite manual flags, keys, history or export source. */
export async function checkLayerFocus(editor: EditorStateReturn) {
  const results: { name: string; passed: boolean; error?: string }[] = []
  const layers = document.querySelector<HTMLElement>('[data-panel="Layers"]')!, timeline = document.querySelector<HTMLElement>('[data-panel="Timeline"]')!
  const scroll = () => timeline.querySelector<HTMLElement>('.overflow-y-auto')!
  const state = () => document.querySelector<HTMLElement>('#focus-state')!
  const source = () => JSON.stringify(editor.getScene())
  const button = (root: ParentNode, label: string) => {
    const node = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(item => item.getAttribute('aria-label') === label || item.textContent?.trim() === label)
    assert(node, `Missing button ${label}`); return node
  }
  const click = async (root: ParentNode, label: string) => { button(root, label).click(); await frames() }
  const action = async (name: string) => { document.querySelector<HTMLButtonElement>(`[data-action="${name}"]`)!.click(); await frames() }
  const selectFamily = async () => {
    const row = layers.querySelector<HTMLElement>('[data-virtual-row="family"]')!
    assert(row, 'Layers family row missing'); row.click(); await frames()
  }
  const visibleFamily = () => {
    const row = timeline.querySelector<HTMLElement>('[data-virtual-row="family"]')!
    assert(row, 'Timeline did not mount the selected family')
    const rect = row.getBoundingClientRect(), viewport = scroll().getBoundingClientRect()
    assert(rect.top >= viewport.top - 1 && rect.top < viewport.bottom, 'Timeline did not scroll to the selected row')
    assert(timeline.querySelector('[data-kf-id="manual-start"]'), 'Child animation was not opened')
  }
  const check = async (name: string, run: () => Promise<void>) => {
    try { await action('reset'); await run(); results.push({ name, passed: true }) }
    catch (error) { results.push({ name, passed: false, error: String(error) }) }
  }
  await check('ordinary Layers selection keeps Timeline scroll; its explicit button opens the layer and child animation', async () => {
    scroll().scrollTop = 0; scroll().dispatchEvent(new Event('scroll')); await frames()
    const before = source(), revision = editor.getRevision(), top = scroll().scrollTop
    await selectFamily(); assert(scroll().scrollTop === top, 'Selection scrolled Timeline automatically')
    await click(layers, 'Show selection in Timeline'); visibleFamily()
    assert(source() === before && editor.getRevision() === revision, 'Find changed source/history')
  })
  await check('repeated explicit reveal overrides and restores text filters without authoring membership', async () => {
    await selectFamily()
    const input = timeline.querySelector<HTMLInputElement>('input[placeholder="Filter layers…"]')!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'missing-filter')
    input.dispatchEvent(new Event('input', { bubbles: true })); await frames()
    const before = source(); await click(layers, 'Show selection in Timeline'); visibleFamily()
    await click(timeline, 'Restore filters'); assert(!timeline.querySelector('[data-virtual-row="family"]'), 'Filter was overwritten')
    await click(layers, 'Show selection in Timeline'); visibleFamily(); assert(source() === before, 'Find authored membership')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '')
    input.dispatchEvent(new Event('input', { bubbles: true })); await frames()
  })
  await check('isolation includes children, respects hidden children, bypasses outside solo and leaves source unchanged', async () => {
    await selectFamily(); const before = source(), revision = editor.getRevision()
    await click(layers, 'Isolate selection and children')
    assert(state().dataset.isolated === 'true', 'Isolation did not activate')
    assert(state().dataset.visible === 'child', 'Isolation lost a child, unhid hidden content or kept an outside object')
    const scene = editor.getScene(), child = scene.layers.find(layer => layer.id === 'child')!
    const bounds = createLayerWorldBoundsResolver(scene, 0)(child)!
    const canvas = document.querySelector<HTMLCanvasElement>('[data-panel="Canvas"] canvas')!
    const pixel = canvas.getContext('2d')!.getImageData(Math.round(bounds.x + bounds.width / 2), Math.round(bounds.y + bounds.height / 2), 1, 1).data
    assert(pixel[0] > 180 && pixel[1] < 120 && pixel[2] < 120, 'Actual viewport did not render the isolated red child')
    assert(source() === before && editor.getRevision() === revision, 'Isolation mutated source/history')
    await click(document, 'Exit viewport isolation')
    assert(state().dataset.isolated === 'false' && source() === before, 'Exit changed authored visibility/solo')
  })
  await check('manual edits and one-step undo survive Exit isolation, with original key identities untouched', async () => {
    await selectFamily(); const before = source()
    await click(layers, 'Isolate selection and children'); await action('edit-child'); const edited = source()
    await click(layers, 'Exit layer isolation'); assert(source() === edited && edited !== before, 'Exit discarded manual edit')
    assert(editor.getScene().layers.find(layer => layer.id === 'outside')?.solo, 'Original solo lost')
    assert(editor.getScene().layers.find(layer => layer.id === 'hidden')?.hidden, 'Original hidden flag lost')
    await action('undo'); assert(source() === before, 'Isolation polluted history or manual key undo')
  })
  await check('document replacement clears the temporary isolation scope', async () => {
    await selectFamily(); await click(layers, 'Isolate selection and children'); await action('replace')
    assert(state().dataset.isolated === 'false', 'Old document isolation leaked into a replacement')
  })
  await check('real canvas drag uses original source and does not commit isolation visibility flags', async () => {
    await selectFamily(); await click(layers, 'Isolate selection and children')
    const before = editor.getScene(), flags = JSON.stringify(before.layers.map(layer => [layer.id, layer.hidden, layer.solo]))
    const child = before.layers.find(layer => layer.id === 'child')!, bounds = createLayerWorldBoundsResolver(before, 0)(child)!
    const canvas = document.querySelector<HTMLCanvasElement>('[data-panel="Canvas"] canvas')!, rect = canvas.getBoundingClientRect()
    const x = rect.left + (bounds.x + bounds.width / 2) * rect.width / canvas.width
    const y = rect.top + (bounds.y + bounds.height / 2) * rect.height / canvas.height
    const event = (type: string, dx: number, dy: number) => new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 701, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x + dx, clientY: y + dy })
    canvas.dispatchEvent(event('pointerdown', 0, 0)); window.dispatchEvent(event('pointermove', 23, 17)); await frames()
    window.dispatchEvent(event('pointerup', 23, 17)); await frames()
    const after = editor.getScene()
    assert(!editor.isTransactionActive() && JSON.stringify(after.layers.map(layer => layer.transform)) !== JSON.stringify(before.layers.map(layer => layer.transform)), 'Drag failed to commit')
    assert(JSON.stringify(after.layers.map(layer => [layer.id, layer.hidden, layer.solo])) === flags, 'Display visibility leaked into source')
    assert(JSON.stringify(after.timelines) === JSON.stringify(before.timelines), 'Isolation drag changed existing animation')
    await click(layers, 'Exit layer isolation'); await action('undo'); assert(JSON.stringify(editor.getScene()) === JSON.stringify(before), 'Drag/isolation history was not exact')
  })
  await action('reset'); await selectFamily(); await click(layers, 'Show selection in Timeline'); await click(layers, 'Isolate selection and children')
  return { passed: results.every(result => result.passed), results }
}
