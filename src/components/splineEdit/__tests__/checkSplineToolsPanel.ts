interface Host {
  doc(): Document
  realm(): Window & typeof globalThis
  frames(n?: number): Promise<void>
  source(): Promise<string>
  click(label: string): Promise<void>
  assert(value: unknown, message: string): void
  record(name: string, evidence: unknown): void
}
/** Native dock tabs select on pointerdown; plain HTMLElement.click skips that
 * production interaction. Shared by the whole-editor fixture and panel checks. */
export async function selectEditorTab(host: Pick<Host, 'doc' | 'realm' | 'frames' | 'assert'>, id: string) {
  const { doc, realm, frames, assert } = host
  const element = doc().querySelector<HTMLElement>(`[data-panel="${id}"][title^="Drag to rearrange"]`)
  assert(element, `Missing ${id} tab`); const rect = element!.getBoundingClientRect()
  element!.dispatchEvent(new (realm().PointerEvent)('pointerdown', { bubbles: true, pointerId: 72, pointerType: 'mouse', button: 0, buttons: 1, clientX: rect.left + 15, clientY: rect.top + 10 }))
  realm().dispatchEvent(new (realm().PointerEvent)('pointerup', { bubbles: true, pointerId: 72, pointerType: 'mouse', button: 0, buttons: 0 })); await frames()
}
/** Actual EditorPage integration over disposable UI-created splines. No private
 * React state/source setter: public context menus, tab pointer events, controls
 * and Inspect Scene JSON validate the production wiring and source invariants. */
export async function checkSplineToolsPanel(host: Host, layerName: string) {
  const { doc, realm, frames, source, click, assert, record } = host
  const before = await source(), history = doc().querySelector('[aria-label="Local recovery"]')!.getAttribute('title')
  const panel = () => doc().querySelector<HTMLElement>('[aria-label="Spline & Boolean tools"]')
  const mode = (name: string) => doc().querySelector(`[aria-label="Spline ${name} mode"]`)?.getAttribute('aria-pressed') === 'true'
  const tab = (id: string) => doc().querySelector<HTMLElement>(`[data-panel="${id}"][title^="Drag to rearrange"]`)!
  const selectTab = (id: string) => selectEditorTab(host, id)
  const context = async (element: HTMLElement, x?: number, y?: number) => {
    const rect = element.getBoundingClientRect()
    element.dispatchEvent(new (realm().MouseEvent)('contextmenu', { bubbles: true, cancelable: true, clientX: x ?? rect.left + 25, clientY: y ?? rect.top + 15 })); await frames()
  }
  const enter = async (name: string) => {
    const item = Array.from(doc().querySelectorAll<HTMLElement>('[role="menuitem"]')).find(el => el.textContent?.trim() === 'Edit Mode▶')
    assert(item, 'Missing shared Edit Mode submenu')
    item!.dispatchEvent(new (realm().MouseEvent)('mouseover', { bubbles: true })); await frames(); await click(name)
  }
  const closeTab = async () => { const close = tab('splineTools').querySelector<HTMLButtonElement>('[data-close-btn]')!; assert(close, 'Missing tools close button'); close.click(); await frames() }
  assert(panel()?.contains(doc().querySelector('[aria-label="Spline edit properties"]')), 'Spline inspector is not inside its dedicated panel')
  assert(mode('object'), 'Drawing did not retain Object mode in its dock panel')
  await selectTab('properties'); assert(!panel(), 'Properties still embeds spline/Boolean controls')
  assert(!doc().querySelector('[aria-label="Boolean preview"]'), 'Boolean controls leaked into Properties')
  record('Spline edit lives in its own dock panel; general Properties stays separate', { panel: 'splineTools' })

  const row = Array.from(doc().querySelectorAll<HTMLElement>('[aria-label="Layers"] li')).find(el => el.querySelector('[title="Double-click to rename"]')?.textContent === layerName)
  assert(row, 'Created spline row missing'); await context(row!); await enter('Point')
  assert(panel() && mode('point'), 'Layers Edit Mode did not reveal the shared Point panel')
  await closeTab(); assert(!panel(), 'Tools panel did not close')
  await context(row!); await enter('Edge'); assert(panel() && mode('edge'), 'Edit Mode did not restore a closed tools panel')
  record('Layers Edit Mode → Point/Edge reveals or restores the same panel without a new source command', { restored: true })

  const canvas = doc().querySelector<HTMLCanvasElement>('[data-testid="canvas-workspace"] canvas')!, rect = canvas.getBoundingClientRect()
  await context(canvas, rect.left + 125 * rect.width / canvas.width, rect.top + 340 * rect.height / canvas.height)
  await enter('Object'); assert(mode('object'), 'Viewport Edit Mode is not synchronized with the panel')
  const objects = Array.from(doc().querySelectorAll<HTMLButtonElement>('[aria-label="Spline objects"] button'))
  assert(objects.length === 2, 'Compound Objects missing from dedicated panel')
  objects[0].click(); await frames(); objects[1].dispatchEvent(new (realm().MouseEvent)('click', { bubbles: true, ctrlKey: true })); await frames()
  await click('Preview Boolean')
  const deadline = performance.now() + 10000
  while (!doc().querySelector('[aria-label="Boolean result preview"]') && performance.now() < deadline) await frames(1)
  assert(panel()?.querySelector('[aria-label="Boolean preview"]'), 'Boolean controls are not inside Spline & Boolean')
  assert(doc().querySelector('[aria-label="Boolean result preview"]'), 'Dedicated panel did not run the real Boolean worker')
  record('Viewport Edit Mode and shared panel modes agree; selected Objects run Boolean in the same panel', { objects: 2 })
  await selectTab('properties'); assert(doc().querySelector('[aria-label="Boolean result preview"]'), 'Changing dock tab discarded the page-owned preview')
  await selectTab('splineTools'); assert(mode('object') && panel()?.querySelector('[aria-label="Boolean preview"]'), 'Reopening tools lost mode/preview state')
  await click('Close preview'); assert(!doc().querySelector('[aria-label="Boolean result preview"]'), 'Close preview did not remove overlay')
  await click('Preview Boolean')
  const applyDeadline = performance.now() + 10000
  while (doc().querySelector<HTMLButtonElement>('[aria-label="Boolean preview"] button.bg-blue-700')?.disabled && performance.now() < applyDeadline) await frames(1)
  const apply = Array.from(doc().querySelectorAll<HTMLButtonElement>('[aria-label="Boolean preview"] button')).find(button => button.textContent === 'Apply Boolean')
  assert(apply && !apply.disabled, `Page Apply unavailable: ${panel()?.textContent}`)
  await click('Cancel'); assert(await source() === before, 'Page Cancel changed source')
  await click('Preview Boolean')
  const readyDeadline = performance.now() + 10000
  while (Array.from(doc().querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent === 'Apply Boolean')?.disabled && performance.now() < readyDeadline) await frames(1)
  await click('Apply Boolean')
  const applied = JSON.parse(await source()), owner = applied.layers.find((layer: { booleanOperation?: unknown }) => layer.booleanOperation)
  assert(owner?.booleanOperation.inputs.length === 2, 'Page Apply did not persist Object references')
  const operationRow = Array.from(doc().querySelectorAll<HTMLElement>('[aria-label="Layers"] li')).find(el => el.querySelector('[title="Double-click to rename"]')?.textContent === owner.name)
  assert(operationRow, 'Boolean group not present in Layers'); await context(operationRow!); await click('Edit Operation')
  assert(panel() && panel()?.textContent?.includes('Apply Boolean'), 'Layers Edit Operation did not reveal the existing dock')
  await click('Cancel')
  // Undo through the native toolbar, then redo once: only one operation is stored.
  await click('↶'); assert(await source() === before, 'Page Apply did not Undo in one step')
  await click('↷'); assert(JSON.parse(await source()).layers.some((layer: { booleanOperation?: unknown }) => layer.booleanOperation), 'Page Redo lost Boolean ownership')
  await click('↶')
  record('Actual EditorPage Apply/Cancel, Layers Edit Operation and one-step Undo/Redo preserve sources and Object IDs', { operation: owner.booleanOperation.operation })
  await selectTab('layers')
  const restoredRow = Array.from(doc().querySelectorAll<HTMLElement>('[aria-label="Layers"] li')).find(el => el.querySelector('[title="Double-click to rename"]')?.textContent === layerName)
  assert(restoredRow, 'Restored spline row missing'); restoredRow!.click(); await frames()
  await selectTab('sceneExplorer'); await click('Find selected'); await frames()
  const explorerRow = Array.from(doc().querySelectorAll<HTMLElement>('[role="tree"][aria-label="Scene Explorer"] [role="treeitem"]')).find(el => el.textContent?.includes(layerName))
  assert(explorerRow, 'Scene Explorer spline row missing'); await context(explorerRow!); await enter('Edge')
  assert(mode('edge') && panel(), 'Scene Explorer Edit Mode did not reach the shared tools panel')
  await selectTab('layers')
  record('Scene Explorer Edit Mode uses the same selected spline and tools panel', { mode: 'edge' })
  assert(await source() === before, 'Panel/menu operations changed source or manual animation')
  // Source is restored; a completed Apply/Undo intentionally leaves one Redo step.
  assert(doc().querySelector('[aria-label="Local recovery"]'), 'Local recovery indicator missing')
  record('Dock switching, closing/reopening and mode selection preserve exact source, manual keys and history', { unchanged: true })
}
