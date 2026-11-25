import { selectEditorTab } from '@/components/splineEdit/__tests__/checkSplineToolsPanel'

interface Host {
  doc(): Document; realm(): Window & typeof globalThis; frames(n?: number): Promise<void>
  source(): Promise<string>; click(label: string): Promise<void>
  assert(value: unknown, message: string): void; record(name: string, evidence: unknown): void
}
/** Full EditorPage acceptance through native controls. Source is read through
 * the public JSON window; test gestures run only on the private QA origin.
 * No application state injection, fake drawing hook or mock snap owner. */
export async function checkDrawingSettings(host: Host) {
  const { doc, realm, frames, source, click, assert, record } = host
  const before = JSON.parse(await source())
  const cv = () => doc().querySelector<HTMLCanvasElement>('[data-testid="canvas-workspace"] canvas')!
  const tap = async (x: number, y: number) => {
    const canvas = cv(), r = canvas.getBoundingClientRect(), position = { clientX: r.left + x * r.width / canvas.width, clientY: r.top + y * r.height / canvas.height }
    for (const type of ['pointerdown', 'pointerup']) {
      ;(type === 'pointerdown' ? canvas : realm()).dispatchEvent(new (realm().PointerEvent)(type, { ...position, pointerId: 87, pointerType: 'mouse', isPrimary: true, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerdown' ? 1 : 0 }))
      await frames()
    }
  }
  const right = async () => {
    const canvas = cv(), r = canvas.getBoundingClientRect()
    canvas.dispatchEvent(new (realm().MouseEvent)('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + r.width * .75, clientY: r.top + r.height * .15 })); await frames()
  }
  const check = async (label: string, value: boolean) => {
    const input = doc().querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)
    assert(input && !input.disabled, `${label} missing/disabled`)
    if (input!.checked !== value) { input!.click(); await frames() }
  }
  const numeric = async (label: string, value: number) => {
    const input = doc().querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)
    assert(input && !input.disabled, `${label} missing/disabled`)
    Object.getOwnPropertyDescriptor(realm().HTMLInputElement.prototype, 'value')!.set!.call(input, String(value))
    input!.dispatchEvent(new (realm().Event)('input', { bubbles: true })); await frames()
    assert(input!.value === String(value), `${label} rejected a supported value`)
  }
  const start = async (autoClose: boolean) => {
    await selectEditorTab(host, 'layers')
    if (!Array.from(doc().querySelectorAll('button')).some(button => button.textContent?.trim() === 'Spline Objects')) await click('+ Add')
    await click('Spline Objects'); await click('Line')
    assert(doc().querySelector('[aria-label="Line drawing options"]'), 'New Line options missing before the first point')
    await check('Spline Auto Close', autoClose)
    assert(!doc().querySelector('[data-panel="properties"] [aria-label="Line drawing options"]'), 'Drawing options embedded in Properties')
    await tap(80, 330); await tap(200, 330); await tap(210, 400); await right()
  }
  await start(true)
  const closed = JSON.parse(await source()), added = closed.layers.find((layer: { id: string }) => !before.layers.some((old: { id: string }) => old.id === layer.id))
  const contour = Object.values(added.spline.contours)[0] as { closed: boolean; pointIds: string[]; segmentIds: string[] }
  assert(contour.closed && contour.pointIds.length === 3 && contour.segmentIds.length === 3, 'Right-click did not close exactly the placed anchors')
  assert(JSON.stringify(closed.timelines) === JSON.stringify(before.timelines), 'Auto Close changed existing animation')
  await click('↶'); assert(JSON.stringify(JSON.parse(await source()).layers) === JSON.stringify(before.layers), 'Auto Close was not one Undo')
  await click('↷'); assert((Object.values(JSON.parse(await source()).layers.find((layer: { id: string }) => layer.id === added.id).spline.contours)[0] as { closed: boolean }).closed, 'Redo lost closure')
  await click('↶'); await start(false)
  const open = JSON.parse(await source()), openLayer = open.layers.find((layer: { id: string }) => !before.layers.some((old: { id: string }) => old.id === layer.id))
  const openContour = Object.values(openLayer.spline.contours)[0] as { closed: boolean; segmentIds: string[] }
  assert(!openContour.closed && openContour.segmentIds.length === 2, 'Auto Close off closed the new line')
  await click('↶')
  record('New Line exposes Auto Close in its edit dock before drawing; right-click open/closed, exactly placed anchors and one Undo/Redo', { closedPoints: 3, closedEdges: 3, openEdges: 2 })

  const baseline = await source(), history = doc().querySelector('[aria-label="Local recovery"]')!.getAttribute('title')
  assert(!doc().querySelector('[data-panel="snap"], [data-panel="shortcuts"]'), 'Retired settings dock tabs still exist')
  const snapButton = doc().querySelector<HTMLButtonElement>('button[title="Snap settings"]')!
  snapButton.click(); await frames()
  const tab = async (id: string) => { doc().querySelector<HTMLButtonElement>(`[data-snap-tab="${id}"]`)!.click(); await frames() }
  await tab('options')
  const popup = doc().querySelector<HTMLElement>('[aria-label="Grid and Snap settings"]')!, popupRect = popup.getBoundingClientRect()
  const viewportRect = doc().querySelector('[data-testid="canvas-viewport"]')!.getBoundingClientRect()
  assert(popupRect.bottom <= viewportRect.bottom + 1, 'Snap palette is clipped outside the viewport')
  const zoomRect = doc().querySelector('[aria-label="Viewport controls"]')!.getBoundingClientRect()
  const overlap = { left: Math.max(zoomRect.left, popupRect.left), top: Math.max(zoomRect.top, popupRect.top), right: Math.min(zoomRect.right, popupRect.right), bottom: Math.min(zoomRect.bottom, popupRect.bottom) }
  if (overlap.left < overlap.right && overlap.top < overlap.bottom) assert(popup.contains(doc().elementFromPoint((overlap.left + overlap.right) / 2, (overlap.top + overlap.bottom) / 2)), 'Zoom controls cover Snap settings')
  await check('Show viewport grid', true); await check('Grid on top of layers', true)
  await numeric('Snap radius', 18); await numeric('Snap grid spacing', 23)
  await tab('snaps'); await check('Snap to Grid', true)
  const enabled = Array.from(doc().querySelectorAll<HTMLInputElement>('[aria-label="Grid and Snap settings"] input[type=checkbox]')).find(input => input.parentElement?.textContent?.includes('Enable Snapping'))!
  assert(enabled, 'Move switch missing'); if (enabled.checked) { enabled.click(); await frames() }
  await tab('rotation'); await check('Enable rotation snapping', true); await numeric('Rotation step', 45)
  await tab('scale'); await check('Enable scale snapping', true); await numeric('Scale step', 10)
  await tab('snaps'); assert(doc().querySelector<HTMLInputElement>('input[aria-label="Snap to Grid"]')!.disabled, 'Move targets should disable with Move off')
  await click('Close Snap settings')
  doc().querySelector<HTMLButtonElement>('button[title="View options"]')!.click(); await frames(); await click('Grid settings…')
  const spacing = doc().querySelector<HTMLInputElement>('input[aria-label="Grid spacing"]')!
  assert(spacing?.value === '23', 'Snap grid spacing diverged from View grid settings')
  await click('Close viewport settings'); doc().querySelector<HTMLButtonElement>('button[title="View options"]')!.click(); await frames()
  snapButton.click(); await frames(); await tab('rotation')
  assert(doc().querySelector<HTMLInputElement>('input[aria-label="Enable rotation snapping"]')!.checked, 'Rotation changed with Move switch')
  await tab('options'); await click('Reset Snap settings'); await click('Close Snap settings')
  record('One main Snap menu owns working targets, radius, grid and independent rotation/scale; shared View spacing and reset work', { spacingPx: 23, radiusScreenPx: 18, rotationDeg: 45, scalePercent: 10 })

  doc().querySelector<HTMLButtonElement>('button[title="Menu"]')!.click(); await frames(); await click('Keyboard Shortcuts')
  const dialog = doc().querySelector<HTMLDialogElement>('dialog[aria-label="Keyboard Shortcuts"]')!
  assert(dialog?.open && dialog.querySelector('[placeholder="Search shortcuts…"]'), 'Shortcut registry not available in modal')
  const mode3d = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent === '3D Mode')!
  mode3d.click(); await frames(); assert(dialog.textContent?.includes('focused 3D viewport'), 'Registry context mode did not switch')
  await click('Close keyboard shortcuts')
  assert(!doc().querySelector('dialog[aria-label="Keyboard Shortcuts"]'), 'Shortcut dialog did not close')
  assert(doc().activeElement?.getAttribute('title') === 'Menu', 'Shortcut close did not restore the Menu trigger focus')
  assert(await source() === baseline && doc().querySelector('[aria-label="Local recovery"]')!.getAttribute('title') === history, 'Settings/help changed source, keys or Undo/Redo')
  record('File → Keyboard Shortcuts opens the searchable registry window, supports context mode, closes with focus restored and preserves source/history', { dockTabsRemoved: true })
}
