interface Check { name: string; passed: boolean; details?: unknown; error?: string }
import { runGlyphChecks } from './runGlyphChecks'

/** Automated checks belong to the isolated test page, not a production bridge.
 * Drive public DOM controls/events and observe the mounted result. No React
 * internals, app credentials, arbitrary scripts or connected editor are used.
 * Pointer events test the dope-sheet's window-listener path; trusted capture /
 * native DnD and full editor acceptance remain separate interactive checks. */
export async function runUIWindowChecks(document: Document, layerIds: readonly string[], readObservers: () => number) {
  const results: Check[] = [], pane = document.querySelector<HTMLElement>('#ui-pane')!
  const check = async (name: string, run: () => unknown | Promise<unknown>) => {
    try { results.push({ name, passed: true, details: await run() }) }
    catch (error) { results.push({ name, passed: false, error: String(error) }) }
  }
  const action = async (name: string) => {
    document.querySelector<HTMLButtonElement>(`[data-action="${name}"]`)!.click(); await frames()
  }
  const view = async (name: string) => {
    Array.from(document.querySelectorAll<HTMLButtonElement>('[data-switch-view]')).find(button => button.dataset.switchView === name)!.click()
    await frames()
  }
  const state = () => JSON.parse(document.querySelector('#ui-state')!.textContent!)
  const rows = () => Array.from(pane.querySelectorAll<HTMLElement>('[data-virtual-row]'))
  const bound = (limit: number) => assert(rows().length > 0 && rows().length <= limit, `Mounted ${rows().length}, limit ${limit}`)
  const scroll = async (element: HTMLElement, top: number) => {
    element.scrollTop = top; element.dispatchEvent(new Event('scroll')); await frames()
  }

  await check('explorer: bounded rows, external selection reveal, manual scroll remains free', async () => {
    await view('Scene Explorer'); bound(70)
    const list = pane.querySelector<HTMLElement>('[role="tree"]')!
    const extent = list.scrollHeight
    assert(extent >= layerIds.length * 22, `Missing scroll extent: ${extent}`)
    await action('last')
    assert(rows().some(row => row.dataset.virtualRow === layerIds[layerIds.length - 1]), 'External selection was not revealed')
    await scroll(list, 0); bound(70)
    assert(list.scrollTop === 0, 'Selected row remount yanked the viewport')
    return { mounted: rows().length, logical: layerIds.length, scrollHeight: extent }
  })

  await check('explorer: focused offscreen control survives scrolling', async () => {
    const list = pane.querySelector<HTMLElement>('[role="tree"]')!
    const control = rows()[0].querySelector<HTMLElement>('button,input,[tabindex="0"]')!
    assert(!!control, 'No focusable native row control')
    control.focus({ preventScroll: true }); await frames()
    await scroll(list, list.scrollHeight)
    assert(control.isConnected && document.activeElement === control, 'Focused row was unmounted')
    bound(72)
    document.querySelector<HTMLButtonElement>('[data-action="clear"]')!.focus()
    await action('clear'); await scroll(list, 0)
    return { mounted: rows().length }
  })

  await check('explorer: Tab crosses an unmounted row boundary', async () => {
    const list = pane.querySelector<HTMLElement>('[role="tree"]')!
    await scroll(list, 0)
    const last = rows()[rows().length - 1], key = last.dataset.virtualRow!
    const controls = Array.from(last.querySelectorAll<HTMLElement>('button,input,select,[tabindex]'))
      .filter(node => node.tabIndex >= 0 && !node.matches(':disabled') && node.getClientRects().length > 0)
    const control = controls[controls.length - 1]
    assert(!!control, 'Boundary has no keyboard control')
    // Ordinary focus() would scroll the overscanned control into view and mount
    // the next row before the missing-row boundary is exercised.
    control.focus({ preventScroll: true }); await frames()
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    control.dispatchEvent(event); await frames()
    assert(event.defaultPrevented, 'Unmounted boundary did not handle Tab')
    const target = (document.activeElement as HTMLElement).closest<HTMLElement>('[data-virtual-row]')
    assert(target?.dataset.virtualRow === layerIds[layerIds.indexOf(key) + 1], 'Tab did not reach the next logical row')
    bound(72)
    return { before: key, after: target?.dataset.virtualRow }
  })

  await check('legacy Layers: bounded native list, exact row spacing, drag source retention', async () => {
    await view('Layers'); bound(65)
    const list = pane.querySelector<HTMLUListElement>('ul[aria-label="Layers"]')!, nativeRows = rows()
    const spacing = nativeRows[1].getBoundingClientRect().top - nativeRows[0].getBoundingClientRect().top
    assert(Math.abs(spacing - 36) < 0.5, `Legacy spacing: ${spacing}`)
    const source = nativeRows[0]
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() }))
    await scroll(list, list.scrollHeight)
    assert(source.isConnected, 'Native drag source was unmounted')
    bound(67)
    source.dispatchEvent(new DragEvent('dragend', { bubbles: true })); await frames()
    return { mounted: rows().length, logical: layerIds.length, spacing }
  })

  await check('dope sheet: shared row window and label/key alignment', async () => {
    await view('Dope Sheet')
    const list = pane.querySelector<HTMLElement>('.dope-sheet-grid')!
    await scroll(list, list.scrollHeight / 2)
    const labels = Array.from(pane.querySelectorAll<HTMLElement>('.dope-sheet-hierarchy [data-virtual-row]'))
    const keyRows = Array.from(pane.querySelectorAll<HTMLElement>('.dope-keyframe-row'))
    assert(labels.length === keyRows.length && labels.length < 50, `Column counts ${labels.length}/${keyRows.length}`)
    labels.forEach((label, i) => assert(Math.abs(label.getBoundingClientRect().top - keyRows[i].getBoundingClientRect().top) < 0.5, 'Column drift'))
    return { mountedPerColumn: labels.length, scrollHeight: list.scrollHeight }
  })

  await check('dope sheet: marquee includes rows that have unmounted during the gesture', async () => {
    const list = pane.querySelector<HTMLElement>('.dope-sheet-grid')!
    await action('clear'); await scroll(list, 0)
    const rect = list.getBoundingClientRect(), area = pane.querySelector<HTMLElement>('.dope-sheet-keyrows')!
    const start = { bubbles: true, cancelable: true, pointerId: 41, pointerType: 'mouse', button: 0, buttons: 1,
      clientX: rect.left + 222, clientY: rect.top + 28 + 10 * 28 + 2 }
    area.dispatchEvent(new PointerEvent('pointerdown', start))
    await scroll(list, 300 * 28)
    const end = { ...start, clientX: rect.right - 10, clientY: rect.top + 330 }
    window.dispatchEvent(new PointerEvent('pointermove', end)); await frames()
    window.dispatchEvent(new PointerEvent('pointerup', { ...end, buttons: 0 })); await frames()
    const mountedKeys = pane.querySelectorAll('.keyframe-symbol').length
    assert(state().selectedKeys > mountedKeys, `Selected ${state().selectedKeys}, mounted keys ${mountedKeys}`)
    return { selectedKeys: state().selectedKeys, mountedKeys }
  })

  await check('timeline: bounded sections and tracks, full-data selection and seek', async () => {
    await view('Timeline'); bound(100)
    const initial = rows().length
    await action('all'); bound(100)
    assert(state().selectedCount === layerIds.length && state().selectedKeys > 3000, 'Full-data selection lost offscreen objects')
    await action('seek'); bound(100)
    return { mounted: rows().length, initial, selectedLayers: state().selectedCount, selectedKeys: state().selectedKeys }
  })

  await check('timeline: one dense layer does not mount its 1000 property rows', async () => {
    await action('dense'); bound(70)
    assert(state().tracks === 1000, 'Dense fixture did not load')
    let scroller = pane.querySelector<HTMLElement>('[data-virtual-row]')?.parentElement ?? null
    while (scroller && scroller.scrollHeight <= scroller.clientHeight) scroller = scroller.parentElement
    assert(!!scroller, 'Dense timeline is not scrollable')
    await scroll(scroller, scroller.scrollHeight / 2); bound(70)
    const mounted = rows().length
    await action('restore'); bound(100)
    return { mounted, logicalTracks: 1000 }
  })

  await check('dense glyphs: 42000 keys, overlap, keyboard, selection, dope and audio', () => runGlyphChecks(document))

  await check('assets: bounded thumbnails, last row, resize and source preservation', async () => {
    await view('Assets'); bound(20)
    const list = pane.querySelector<HTMLElement>('[aria-label="Assets"]')!
    await scroll(list, list.scrollHeight)
    assert(pane.textContent?.includes('Shared thumbnail 3000'), 'Last inventory entry is unreachable')
    await action('resize'); await frames(8); bound(20)
    const cards = pane.querySelectorAll('[data-asset-id]'), images = pane.querySelectorAll('img')
    assert(cards.length <= 30 && images.length === cards.length, `Thumbnails: ${images.length}`)
    return { mountedCards: cards.length, logicalAssets: state().assets, width: list.clientWidth, scrollHeight: list.scrollHeight }
  })
  await check('lifecycle: ten panel-switch cycles disconnect every native observer', async () => {
    const samples: number[] = []
    for (let i = 0; i < 10; i++) {
      await view(i % 2 ? 'Timeline' : 'Dope Sheet')
      samples.push(readObservers())
      await action('unmount')
      assert(readObservers() === 0, `${readObservers()} observers remain after unmount`)
    }
    await view('Assets')
    return { activePerMount: samples, afterUnmount: 0, finalView: readObservers() }
  })
  return { passed: results.every(row => row.passed), results,
    environment: { userAgent: navigator.userAgent, viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio } } }
}

/** Waits bounded render/layout turns; no production polling loop is installed. */
async function frames(count = 5): Promise<void> {
  for (let i = 0; i < count; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
