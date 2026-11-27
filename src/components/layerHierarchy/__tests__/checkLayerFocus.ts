import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
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
  const click = async (root: ParentNode, label: string) => {
    if (label === 'Next keyframe (.)') {
      button(root, 'Next frame (Right)').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })); await frames()
      button(document, label).click(); await frames(); return
    }
    const node = button(root, label), disclosure = node.closest('details')
    if (disclosure && !disclosure.open) { disclosure.querySelector('summary')!.click(); await frames() }
    node.click(); await frames()
  }
  const isolate = async () => {
    layers.querySelector<HTMLElement>('[data-virtual-row="family"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 210 }))
    await frames()
    const menuItem = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(node => node.textContent?.trim() === 'Isolate selection')
    assert(menuItem, 'Isolate selection context action missing'); menuItem.click(); await frames()
  }
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
  await check('selection automatically reveals existing animation only after pointer release', async () => {
    scroll().scrollTop = 0; scroll().dispatchEvent(new Event('scroll')); await frames()
    const before = source(), revision = editor.getRevision(), top = scroll().scrollTop
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 99 }))
    await selectFamily(); assert(scroll().scrollTop === top, 'Timeline moved during the selecting gesture')
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 99 })); await frames(); visibleFamily()
    assert(source() === before && editor.getRevision() === revision, 'Automatic find changed source/history')
  })
  await check('a selecting transaction blocks reveal until its commit notification', async () => {
    scroll().scrollTop = 0; scroll().dispatchEvent(new Event('scroll')); await frames()
    const top = scroll().scrollTop
    editor.beginTransaction(); await selectFamily()
    assert(scroll().scrollTop === top, 'Active transaction allowed dock/scroll changes')
    const child = editor.getScene().layers.find(layer => layer.id === 'child')!
    editor.commitTransaction(makeUpdateLayerCmd(child.id, { name: 'Manual edit while waiting' }, child)); await frames(); visibleFamily()
  })
  await check('multi-selection reveals both branches without replacing selected IDs', async () => {
    await selectFamily()
    layers.querySelector<HTMLElement>('[data-virtual-row="outside"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })); await frames()
    assert(timeline.querySelector('[data-virtual-row="family"]') && timeline.querySelector('[data-virtual-row="outside"]'), 'Multi-selection lost a requested branch')
    assert(layers.textContent?.includes('2 selected'), 'Automatic find replaced multi-selection')
  })
  await check('Tools starts collapsed; opening and closing retains secondary actions without source changes', async () => {
    const tools = timeline.querySelector<HTMLDetailsElement>('[data-timeline-tools]')!
    if (tools.open) tools.querySelector('summary')!.click()
    await frames(); const before = source(), height = tools.getBoundingClientRect().height
    assert(height < 36, 'Collapsed Tools still takes multiple rows')
    tools.querySelector('summary')!.click(); await frames()
    assert(tools.getBoundingClientRect().height > height && tools.contains(button(timeline, 'Find selected')), 'Tools did not contain secondary actions')
    tools.querySelector('summary')!.click(); await frames()
    assert(tools.getBoundingClientRect().height === height && source() === before, 'Collapse lost track space or authored source')
  })
  await check('repeated explicit reveal overrides and restores text filters without authoring membership', async () => {
    await selectFamily()
    const input = timeline.querySelector<HTMLInputElement>('input[placeholder="Filter layers…"]')!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'missing-filter')
    input.dispatchEvent(new Event('input', { bubbles: true })); await frames()
    const before = source(); await click(timeline, 'Find selected'); visibleFamily()
    await click(timeline, 'Restore filters'); assert(!timeline.querySelector('[data-virtual-row="family"]'), 'Filter was overwritten')
    await click(timeline, 'Find selected'); visibleFamily(); assert(source() === before, 'Find authored membership')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '')
    input.dispatchEvent(new Event('input', { bubbles: true })); await frames()
  })
  await check('isolation includes children, respects hidden children, bypasses outside solo and leaves source unchanged', async () => {
    await selectFamily(); const before = source(), revision = editor.getRevision()
    await isolate()
    assert(state().dataset.isolated === 'true', 'Isolation did not activate')
    assert(!layers.querySelector('[data-virtual-row="outside"]') && !timeline.querySelector('[data-virtual-row="outside"]'), 'Outside rows leaked into isolated panels')
    assert(layers.querySelector('[data-virtual-row="hidden"]') && timeline.querySelector('[data-kf-id="mid-y-300"]'), 'Hidden children or own keys were lost in isolated panels')
    assert(!timeline.querySelector('[data-kf-id="outside-start"]'), 'Outside animation was not isolated')
    assert(state().dataset.visible === 'child', 'Isolation lost a child, unhid hidden content or kept an outside object')
    const scene = editor.getScene(), child = scene.layers.find(layer => layer.id === 'child')!
    const bounds = createLayerWorldBoundsResolver(scene, 0)(child)!
    const canvas = document.querySelector<HTMLCanvasElement>('[data-panel="Canvas"] canvas')!
    const pixel = canvas.getContext('2d')!.getImageData(Math.round(bounds.x + bounds.width / 2), Math.round(bounds.y + bounds.height / 2), 1, 1).data
    assert(pixel[0] > 180 && pixel[1] < 120 && pixel[2] < 120, 'Actual viewport did not render the isolated red child')
    assert(source() === before && editor.getRevision() === revision, 'Isolation mutated source/history')
    await click(document, 'Exit viewport isolation')
    assert(state().dataset.isolated === 'false' && source() === before, 'Exit changed authored visibility/solo')
    assert(layers.querySelector('[data-virtual-row="outside"]'), 'Exit did not restore full layer list')
  })
  await check('manual edits and one-step undo survive Exit isolation, with original key identities untouched', async () => {
    await selectFamily(); const before = source()
    await isolate(); await action('edit-child'); const edited = source()
    await click(document, 'Exit viewport isolation'); assert(source() === edited && edited !== before, 'Exit discarded manual edit')
    assert(editor.getScene().layers.find(layer => layer.id === 'outside')?.solo, 'Original solo lost')
    assert(editor.getScene().layers.find(layer => layer.id === 'hidden')?.hidden, 'Original hidden flag lost')
    await action('undo'); assert(source() === before, 'Isolation polluted history or manual key undo')
  })
  await check('document replacement clears the temporary isolation scope', async () => {
    await selectFamily(); await isolate(); await action('replace')
    assert(state().dataset.isolated === 'false', 'Old document isolation leaked into a replacement')
  })
  await check('real canvas drag uses original source and does not commit isolation visibility flags', async () => {
    await selectFamily(); await isolate()
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
    await click(document, 'Exit viewport isolation'); await action('undo'); assert(JSON.stringify(editor.getScene()) === JSON.stringify(before), 'Drag/isolation history was not exact')
  })
  const dragBox = async (end: 'up' | 'cancel' | 'escape' = 'up', shift = false, finalOnly = false) => {
    const area = timeline.querySelector<HTMLElement>('[aria-label="Timeline key selection area"]')!
    const ids = ['mid-x-200', 'mid-x-700', 'mid-y-300', 'mid-y-600']
    const rects = ids.map(id => timeline.querySelector<HTMLElement>(`[data-kf-id="${id}"]`)!.getBoundingClientRect())
    const x1 = Math.min(...rects.map(rect => rect.x)) - 12, y1 = Math.min(...rects.map(rect => rect.y)) - 5
    const x2 = Math.max(...rects.map(rect => rect.right)) + 12, y2 = Math.max(...rects.map(rect => rect.bottom)) + 5
    const event = (type: string, x: number, y: number) => new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 802, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y, shiftKey: shift })
    area.dispatchEvent(event('pointerdown', x1, y1)); await frames()
    if (!finalOnly) { area.dispatchEvent(event('pointermove', x2, y2)); await frames(); assert(timeline.querySelector('[data-timeline-marquee]'), 'Selection rectangle did not appear') }
    if (end === 'escape') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    else area.dispatchEvent(event(end === 'up' ? 'pointerup' : 'pointercancel', x2, y2))
    await frames()
    // The native click after release must not clear a completed box selection.
    area.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })); await frames()
    assert(!timeline.querySelector('[data-timeline-marquee]'), 'Selection preview remained after termination')
  }
  await check('plain mouse rectangle selects keys across property rows inside isolation without source/history edits', async () => {
    await selectFamily(); await isolate(); const before = source(), history = editor.getCommittedHistory().past.length
    await dragBox()
    const selected = new Set(state().dataset.keys?.split(','))
    assert(selected.size === 4 && ['mid-x-200', 'mid-x-700', 'mid-y-300', 'mid-y-600'].every(id => selected.has(id)), 'Rectangle selected the wrong keys')
    assert(source() === before && editor.getCommittedHistory().past.length === history, 'Box selection changed source/history')
    assert(getComputedStyle(timeline.querySelector('[data-kf-id="mid-x-200"]')!).cursor === 'ew-resize', 'Keyframe still uses a hand cursor')
  })
  await check('Shift rectangle adds to selection while discarding dormant outside keys', async () => {
    await selectFamily(); await isolate(); await action('seed-keys'); await dragBox('up', true)
    const selected = new Set(state().dataset.keys?.split(','))
    assert(selected.size === 5 && selected.has('manual-start') && !selected.has('outside-start'), 'Additive selection leaked outside or lost its baseline')
  })
  await check('release coordinates select correctly without a final move event', async () => {
    await selectFamily(); await isolate(); await dragBox('up', false, true)
    assert(state().dataset.keys?.split(',').length === 4, 'Release used stale movement coordinates')
  })
  for (const end of ['cancel', 'escape'] as const) await check(`${end} discards rectangle selection`, async () => {
    await selectFamily(); await isolate(); await action('seed-keys'); const before = state().dataset.keys
    await dragBox(end)
    assert(state().dataset.keys === before, 'Cancelled rectangle committed a selection')
  })
  await check('key navigation with no selected object stays within isolation', async () => {
    await selectFamily(); await isolate(); await action('clear-selection')
    await click(timeline, 'Next keyframe (.)')
    assert(state().dataset.time === '200', 'Navigation visited an outside key at 100 ms')
  })
  await check('isolated Select All and Delete preserve outside animation and make one Undo', async () => {
    await selectFamily(); await isolate(); await action('seed-keys')
    const before = editor.getScene(), history = editor.getCommittedHistory().past.length
    const outside = JSON.stringify(before.timelines[0].tracks.find(track => track.target === 'layers.outside.opacity'))
    await click(timeline, 'All')
    assert(state().dataset.keys?.split(',').length === 6 && !state().dataset.keys?.includes('outside'), 'Select All escaped isolation')
    const remove = Array.from(timeline.querySelectorAll<HTMLButtonElement>('button')).find(node => node.title === 'Delete selected keyframes')!
    remove.click(); await frames()
    assert(JSON.stringify(editor.getScene().timelines[0].tracks.find(track => track.target === 'layers.outside.opacity')) === outside, 'Bulk delete changed outside keys')
    assert(editor.getCommittedHistory().past.length === history + 1, 'Bulk delete was not one Undo')
    await action('undo'); assert(editor.getScene() === before, 'Undo did not restore exact animation')
  })
  await action('reset'); await selectFamily(); await click(timeline, 'Find selected'); await isolate()
  return { passed: results.every(result => result.passed), results }
}
