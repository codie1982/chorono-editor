import type { ChronoScene } from '@/lib/types'
import { parseSceneJson } from '@/lib/format/scene/SceneJsonConverter'

/** Allow React, ResizeObserver and virtualizer RAF to settle after native UI. */
async function frames() { for (let i = 0; i < 12; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve())) }
/** Fail a case without hiding the remaining independent acceptance checks. */
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }

/** Real DOM acceptance: no duplicated projection/command logic or bridge to a
 * user editor. getScene borrows the fixture's current committed source solely
 * to verify immutable edits, one-step history and portable metadata equality.
 */
export async function checkEditorHierarchy(getScene: () => ChronoScene) {
  const results: { name: string; passed: boolean; error?: string }[] = []
  const panels = ['Explorer', 'Timeline'].map(name => document.querySelector<HTMLElement>(`[data-panel="${name}"]`)!)
  const row = (panel: HTMLElement, id: string) => Array.from(panel.querySelectorAll<HTMLElement>('[data-virtual-row]')).find(node => node.dataset.virtualRow === id)
  const header = (panel: HTMLElement, id: string) => {
    const element = row(panel, id)
    return element?.matches('[role="treeitem"]') ? element : element?.querySelector<HTMLElement>('[role="treeitem"]')
  }
  const scroll = (panel: HTMLElement) => panel.dataset.panel === 'Explorer'
    ? panel.querySelector<HTMLElement>('[role="tree"]')! : panel.querySelector<HTMLElement>('.overflow-y-auto')!
  const button = (root: ParentNode, label: string) => {
    const found = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(node => node.textContent?.trim() === label)
    assert(found, `Missing button ${label}`); return found
  }
  const action = async (name: string) => { document.querySelector<HTMLButtonElement>(`[data-action="${name}"]`)!.click(); await frames() }
  const select = async (id: string) => { document.querySelector<HTMLButtonElement>(`[data-select="${id}"]`)!.click(); await frames() }
  const click = async (root: ParentNode, label: string) => { button(root, label).click(); await frames() }
  const input = async (element: HTMLInputElement, value: string) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true })); await frames()
  }
  const check = async (name: string, run: () => Promise<void>) => {
    try { await run(); results.push({ name, passed: true }) }
    catch (error) { results.push({ name, passed: false, error: String(error) }) }
  }
  const visible = (panel: HTMLElement, id: string) => {
    const element = header(panel, id), viewport = scroll(panel).getBoundingClientRect()
    assert(element, `${panel.dataset.panel}: ${id} unmounted`)
    const rect = element.getBoundingClientRect()
    assert(rect.top >= viewport.top - 1 && rect.bottom <= viewport.bottom + 1, `${panel.dataset.panel}: ${id} clipped`)
    assert(element.getAttribute('aria-selected') === 'true', `${panel.dataset.panel}: selection not highlighted`)
    assert(panel.querySelectorAll('[data-virtual-row]').length < 90, 'Unbounded DOM rows')
  }
  await frames()
  const initial = JSON.stringify(getScene())
  await check('offscreen selection and same-object reselect reveal both panels without stealing focus', async () => {
    const control = document.querySelector<HTMLButtonElement>('[data-select="root-499"]')!; control.focus()
    await select('root-499'); panels.forEach(panel => visible(panel, 'root-499'))
    assert(document.activeElement === control, 'Selection stole focus')
    await select('root-0'); panels.forEach(panel => visible(panel, 'root-0'))
    panels.forEach(panel => { scroll(panel).scrollTop = 5000; scroll(panel).dispatchEvent(new Event('scroll')) }); await frames()
    const positions = panels.map(panel => scroll(panel).scrollTop)
    await action('tick'); panels.forEach((panel, i) => assert(scroll(panel).scrollTop === positions[i], 'Render tick snapped scroll back'))
    await select('root-0'); panels.forEach(panel => visible(panel, 'root-0'))
  })
  await check('branch collapse is independent of own property collapse and selection opens ancestors', async () => {
    await select('outer')
    await click(panels[1], 'Collapse subtree')
    assert(!row(panels[1], 'child'), 'Child remained visible after collapse')
    assert(header(panels[1], 'outer')?.getAttribute('aria-expanded') === 'false', 'Branch state not exposed')
    assert(row(panels[1], 'outer')?.querySelector('[data-kf-id]'), 'Branch collapse also hid own keys')
    await action('tick'); assert(!row(panels[1], 'child'), 'Tick reopened collapsed branch')
    await select('child'); panels.forEach(panel => visible(panel, 'child'))
    panels.forEach(panel => assert(header(panel, 'child')?.getAttribute('aria-level') === '3', 'Wrong shared depth'))
  })
  await check('explicit Find overrides filters reversibly without source/history edits', async () => {
    for (const panel of panels) await input(panel.querySelector<HTMLInputElement>('input[placeholder*="Search"],input[placeholder*="Filter layers"]')!, 'no-such-layer')
    panels.forEach(panel => assert(!row(panel, 'child'), 'Filter ignored'))
    for (const panel of panels) await click(panel, 'Find selected')
    panels.forEach(panel => visible(panel, 'child'))
    for (const panel of panels) await click(panel, 'Restore filters')
    panels.forEach(panel => assert(!row(panel, 'child'), 'Find did not restore filter'))
    assert(JSON.stringify(getScene()) === initial, 'UI-only action changed source or attribution')
    for (const panel of panels) await input(panel.querySelector<HTMLInputElement>('input[placeholder*="Search"],input[placeholder*="Filter layers"]')!, '')
  })
  await check('foreign timeline Find exposes context only; no timing/audio/key controls', async () => {
    await select('foreign-audio'); await click(panels[1], 'Find selected')
    visible(panels[1], 'foreign-audio')
    const element = row(panels[1], 'foreign-audio')!
    assert(element.dataset.contextOnly === 'true' && element.textContent?.includes('outside this timeline'), 'Foreign row is editable')
    assert(!element.querySelector('[data-kf-id],input'), 'Foreign audio controls leaked')
    assert(JSON.stringify(getScene()) === initial, 'Find authored membership')
    await click(panels[1], 'Restore filters')
  })
  await check('complete source subtree visibility, lock, solo and freeze use one undo/redo, preserving manual keys', async () => {
    for (const panel of panels) {
      await select('outer'); await click(panel, 'Collapse subtree')
      for (const field of ['hidden', 'locked', 'solo', 'frozen'] as const) {
        const before = JSON.stringify(getScene())
        if (field === 'hidden') await click(panel, 'Hide subtree')
        else {
          const element = panel.querySelector<HTMLSelectElement>('select[aria-label="More subtree actions"]')!
          element.value = String({ locked: 0, solo: 2, frozen: 4 }[field]); element.dispatchEvent(new Event('change', { bubbles: true })); await frames()
        }
        const after = getScene()
        assert(after.layers.filter(item => ['outer', 'inner', 'child'].includes(item.id)).every(item => item[field]), `${field} skipped collapsed children`)
        assert(!after.layers.find(item => item.id === 'root-0')?.[field], 'Unrelated layer changed')
        assert(JSON.stringify(after.timelines) === JSON.stringify(JSON.parse(before).timelines), 'Animation keys changed')
        assert(after.layers.find(item => item.id === 'child')?.transform.x === 91, 'Manual transform changed')
        const committed = JSON.stringify(after)
        await action('undo'); assert(JSON.stringify(getScene()) === before, 'Undo did not restore exact source')
        await action('redo'); assert(JSON.stringify(getScene()) === committed, 'Redo restamped source')
        await action('undo')
      }
    }
  })
  await check('multi-selection branch union reaches Timeline, Dope Sheet and Curve Editor', async () => {
    await action('both'); await click(panels[1], 'Selected branches')
    assert(!row(panels[1], 'outer')?.querySelector('[data-kf-id]'), 'Ancestor own keys leaked into selection filter')
    const dope = document.querySelector<HTMLElement>('[data-panel="Dope"]')!
    await click(dope, 'Selected Only')
    assert(dope.textContent?.includes('Clock hands · 09:05'), 'Primary branch missing')
    const curve = document.querySelector<HTMLElement>('[data-panel="Curve"]')!
    assert(curve.textContent?.includes('Clock hands · 09:05 · transform.x') && curve.textContent?.includes('other-child · transform.x'), 'Curve union missing an owner')
    assert(!curve.textContent?.includes('outer · transform.x'), 'Unselected ancestor curve leaked')
    await click(panels[1], 'Selected branches')
  })
  await check('keyboard tree navigation crosses virtual row boundaries without implicit selection', async () => {
    await select('root-0')
    for (const panel of panels) {
      header(panel, 'root-0')!.focus()
      for (let i = 0; i < 35; i++) { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); await new Promise<void>(resolve => requestAnimationFrame(() => resolve())) }
      await frames()
      assert(header(panel, 'root-35') === document.activeElement, `${panel.dataset.panel}: keyboard lost focus at virtual gap`)
      assert(header(panel, 'root-35')!.getAttribute('aria-selected') === 'false', 'Arrow selected implicitly')
    }
  })
  await check('reparenting a selected path reveals new ancestors, and undo/portable reopen keep identity and metadata', async () => {
    await select('child')
    const before = JSON.stringify(getScene()); await action('reparent')
    panels.forEach(panel => visible(panel, 'child'))
    assert(getScene().layers.find(item => item.id === 'inner')?.parentId === 'root-0', 'Reparent command not applied')
    const reopened = parseSceneJson(JSON.stringify(getScene()), true)
    assert(JSON.stringify(reopened) === JSON.stringify(getScene()), 'Portable source or ledger changed')
    await action('undo'); assert(JSON.stringify(getScene()) === before, 'Reparent undo changed manual source')
    panels.forEach(panel => visible(panel, 'child'))
  })
  return { passed: results.every(result => result.passed), results, layers: getScene().layers.length }
}
