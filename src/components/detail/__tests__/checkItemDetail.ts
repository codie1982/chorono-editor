import { fixtureEditor } from './browser-detail'

/** Real React/DOM flow checks. Synthetic click/input events are explicitly not
 * OS mouse coverage; trusted browser actions are checked separately. Source
 * comparisons use committed JSON, so a screenshot alone cannot mask data loss.
 */
export async function checkItemDetail(): Promise<string> {
  const results: string[] = []
  const tick = () => new Promise(resolve => setTimeout(resolve, 90))
  const root = () => document.querySelector<HTMLElement>('[aria-label="Item detail editor"]')
  const source = () => fixtureEditor().getCommittedScene()
  const button = (label: string, within: ParentNode = document) => Array.from(within.querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent?.trim() === label)
  const click = async (element: HTMLElement | null | undefined) => { if (!element) throw new Error('Missing UI control'); element.click(); await tick() }
  const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message) }
  const input = async (label: string, value: string) => {
    const fieldset = root()?.querySelector(`fieldset[aria-label="${label}"]`)
    const control = fieldset?.querySelector<HTMLInputElement>('input[type="text"], input[type="number"]')
    if (!control) throw new Error(`Missing field ${label}`)
    control.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(control, value)
    control.dispatchEvent(new Event('input', { bubbles: true })); control.dispatchEvent(new Event('change', { bubbles: true })); await tick()
    control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await tick()
  }
  const openFromLayerMenu = async (id = 'robot') => {
    const row = document.querySelector<HTMLElement>(`[data-virtual-row="${id}"]`)!
    assert(row, 'Layer row missing')
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 220 })); await tick()
    const item = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(node => node.textContent?.trim() === 'Edit content…')
    await click(item)
  }
  const check = async (name: string, run: () => Promise<void>) => { try { await run(); results.push(`PASS ${name}`) } catch (error) { results.push(`FAIL ${name}: ${String(error)}`); throw error } }
  try {
    await check('2D layer right-click keeps main editing without an Edit content entry', async () => {
      const before = JSON.stringify(source())
      document.querySelector<HTMLElement>('[data-virtual-row="card"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 220 })); await tick()
      assert(!Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).some(node => node.textContent?.trim() === 'Edit content…'), '2D detail entry remains visible')
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await tick()
      assert(!root() && JSON.stringify(source()) === before, '2D right-click changed source or opened detail')
    })
    await check('detail opens from real Layers; main viewport remains mounted/inert and source is unchanged', async () => {
      const before = JSON.stringify(source()), canvas = document.querySelector('#main-detail-background canvas')
      await openFromLayerMenu()
      assert(root() && document.getElementById('main-detail-background')!.inert, 'Detail did not take focus ownership')
      assert(!root()?.querySelector('[aria-label="Motion keys"]'), 'Outer motion-key editor leaked into content inspection')
      assert(document.querySelector('#main-detail-background canvas') === canvas, 'Main canvas was remounted')
      assert(JSON.stringify(source()) === before, 'Opening changed source')
    })
    await check('model draft/dirty Back/Stay/Discard preserves source, keys, selection and main canvas', async () => {
      const before = JSON.stringify(source()), revision = fixtureEditor().getRevision()
      await input('Position Z', '0.5'); await click(button('← Back', root()!))
      assert(root()?.querySelector('[aria-label="Unsaved detail changes"]'), 'Dirty Back silently left')
      await click(button('Stay', root()!)); assert(root(), 'Stay closed the draft')
      await click(button('Cancel', root()!)); await click(button('Discard & return', root()!))
      assert(!root() && JSON.stringify(source()) === before && fixtureEditor().getRevision() === revision, 'Cancel changed source/history')
      assert(document.getElementById('detail-state')?.dataset.selection === 'robot', 'Selection changed')
    })
    await check('Apply is one source Undo; Redo and main hierarchy/keys are preserved', async () => {
      const before = source(), count = fixtureEditor().getCommittedHistory().past.length
      await openFromLayerMenu(); await input('Position Z', '0.25'); await click(button('Apply & return', root()!))
      assert(!root() && source().layers[1].model3d?.position.z === 0.25, 'Apply did not update content')
      assert(source().timelines === before.timelines && source().layers[0].transform === before.layers[0].transform, 'Outer animation/transform changed')
      assert(fixtureEditor().getCommittedHistory().past.length === count + 1, 'Apply was not one Undo')
      await click(document.getElementById('main-undo')); assert(source() === before, 'Undo did not restore source')
      await click(document.getElementById('main-redo')); assert(source().layers[1].model3d?.position.z === 0.25, 'Redo failed')
    })
    await check('concurrent manual edit invalidates Apply and survives Discard', async () => {
      await openFromLayerMenu(); await input('Position Z', '0.75'); await click(document.getElementById('external-edit'))
      assert(button('Apply & return', root()!)?.disabled, 'Stale Apply remained enabled')
      await click(button('Cancel', root()!)); await click(button('Discard & return', root()!))
      assert(source().layers[0].name === 'Manual update while detail open' && source().layers[1].model3d?.position.z === 0.25, 'Discard overwrote manual change')
    })
    await check('real model schemas change internal Z while outer box and tracks stay unchanged', async () => {
      const before = source(), model = before.layers[1]
      await click(document.getElementById('open-model-detail')); await input('Position Z', '0.5'); await click(button('Apply & return', root()!))
      assert(source().layers[1].model3d?.position.z === .5, 'Internal placement did not apply')
      assert(source().layers[1].transform === model.transform && source().layers[1].size === model.size && source().timelines === before.timelines, 'Model outer scope changed')
    })
    await check('document replacement closes stale detail without applying its draft', async () => {
      await click(document.getElementById('open-model-detail')); assert(root()?.querySelector('fieldset[aria-label="Position Z"]'), 'Model adapter missing')
      await click(document.getElementById('reset-document')); assert(!root(), 'Document replacement retained stale detail')
      assert(source().layers[0].size?.width === 100, 'Old draft applied to new document')
    })
  } catch { /* Keep the first failure and earlier evidence visible in the fixture. */ }
  return results.join('\n')
}
