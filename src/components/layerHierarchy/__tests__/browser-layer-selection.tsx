import { createRoot } from 'react-dom/client'
import EditorPage from '@/app/page'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import type { ChronoScene } from '@/lib/types'

/** A private QA origin mounts actual EditorPage. Tests invoke visible list,
 * context-menu, source-inspector and keyboard controls. No scene/state API or
 * input/renderer/keyboard adapter is mocked; the connected user file is untouched.
 */
if (new URL(location.href).searchParams.has('subject')) {
  createRoot(document.getElementById('app')!).render(<EditorPage />)
} else {
  document.body.style.cssText = 'margin:16px;background:#030712;color:#e5e7eb;font:14px system-ui'
  document.getElementById('app')!.innerHTML = '<h1>Layer selection acceptance</h1><button id="run-selection">Run selection checks</button><p id="status">Ready</p><pre id="report"></pre><iframe id="subject" title="Isolated production editor" style="box-sizing:content-box;border:1px solid #475569;width:1440px;height:900px;display:block"></iframe>'
  const frame = document.getElementById('subject') as HTMLIFrameElement
  frame.src = `${location.pathname}?subject=1`
  const doc = () => frame.contentDocument!, realm = () => frame.contentWindow as Window & typeof globalThis
  const assert = (value: unknown, message: string) => { if (!value) throw new Error(message) }
  const frames = async (n = 3) => { for (let i = 0; i < n; i++) await new Promise(requestAnimationFrame) }
  const until = async (test: () => boolean, message: string) => {
    const end = performance.now() + 15000
    while (!test() && performance.now() < end) await frames(1)
    assert(test(), message)
  }
  const click = async (text: string) => {
    const element = Array.from(doc().querySelectorAll<HTMLElement>('button,[role="menuitem"]')).find(item => item.getAttribute('aria-label') === text || item.title === text || item.textContent?.trim() === text
      || item.getAttribute('role') === 'menuitem' && item.firstElementChild?.textContent?.trim() === text)
    assert(element, `Missing native control ${text}`); element!.focus(); element!.click(); await frames()
  }
  const source = async (): Promise<ChronoScene> => {
    await click('Project'); await click('Inspect Scene JSON…')
    await until(() => !!doc().querySelector('[aria-label="Project JSON"] pre')?.textContent?.startsWith('{'), 'JSON not ready')
    const scene = JSON.parse(doc().querySelector('[aria-label="Project JSON"] pre')!.textContent!) as ChronoScene
    await click('Close JSON'); return scene
  }
  const rows = () => Array.from(doc().querySelectorAll<HTMLElement>('ul[aria-label="Layers"] [data-virtual-row]'))
  const selected = () => rows().filter(row => row.className.includes('bg-blue-')).map(row => row.dataset.virtualRow!)
  const equals = (a: unknown, b: unknown, message: string) => assert(JSON.stringify(a) === JSON.stringify(b), message)
  const rowClick = async (id: string, modifiers: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } = {}) => {
    const row = rows().find(item => item.dataset.virtualRow === id); assert(row, `Missing visible row ${id}`)
    row!.dispatchEvent(new (realm().MouseEvent)('click', { bubbles: true, cancelable: true, ...modifiers })); await frames()
  }
  const escape = async () => { (doc().activeElement ?? doc().body).dispatchEvent(new (realm().KeyboardEvent)('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await frames() }
  /** Restore the intended public panel through its normal dock gesture; a
   * previous QA run may have persisted Scene Explorer as the active tab. */
  const activatePanel = async (id: string) => {
    const tab = doc().querySelector<HTMLElement>(`[data-panel="${id}"][title^="Drag to rearrange"]`)!
    assert(tab, `Missing panel tab ${id}`)
    const rect = tab.getBoundingClientRect(), point = { clientX: rect.left + 20, clientY: rect.top + 10 }
    tab.dispatchEvent(new (realm().PointerEvent)('pointerdown', { bubbles: true, button: 0, buttons: 1, pointerId: 1, ...point }))
    realm().dispatchEvent(new (realm().PointerEvent)('pointerup', { bubbles: true, button: 0, buttons: 0, pointerId: 1, ...point }))
    await frames(5)
  }
  const button = document.getElementById('run-selection') as HTMLButtonElement
  button.onclick = async () => {
    button.disabled = true
    const checks: string[] = [], status = document.getElementById('status')!, report = document.getElementById('report')!
    status.textContent = 'Running'
    try {
      await until(() => !!doc()?.querySelector('[data-testid="editor-toolbar"]'), 'Editor did not mount')
      await frames(6)
      const open = Array.from(doc().querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent?.trim() === 'Open editor')
      if (open) { open.click(); await frames() }
      await activatePanel('layers')
      const baseline = await source(), ids = rows().slice(0, 5).map(row => row.dataset.virtualRow!)
      assert(ids.length === 5, 'Demo did not expose five rows')
      await rowClick(ids[0]); await rowClick(ids[3], { shiftKey: true })
      equals(selected(), ids.slice(0, 4), 'Shift did not select the inclusive visible range')
      await rowClick(ids[1], { shiftKey: true })
      equals(selected(), ids.slice(0, 2), 'Repeated Shift changed the range anchor')
      await rowClick(ids[0], { ctrlKey: true }); equals(selected(), [ids[1]], 'Ctrl did not toggle one item')
      await rowClick(ids[4], { metaKey: true }); equals(selected(), [ids[1], ids[4]], 'Cmd did not add a disjoint item')
      checks.push('Shift extends/shrinks one stable range; Ctrl/Cmd toggles independent rows')

      const viewport = doc().querySelector<HTMLElement>('[data-testid="canvas-viewport"]')!
      const rect = viewport.getBoundingClientRect()
      const point = { clientX: rect.left + 55, clientY: rect.top + rect.height / 2 }
      viewport.dispatchEvent(new (realm().PointerEvent)('pointerdown', { bubbles: true, button: 0, buttons: 1, pointerId: 1, ...point }))
      realm().dispatchEvent(new (realm().PointerEvent)('pointerup', { bubbles: true, button: 0, buttons: 0, pointerId: 1, ...point }))
      await frames(); equals(selected(), [], 'Empty pasteboard did not clear all layers')
      assert(!doc().querySelector('[data-testid="selection-frame"]'), 'Stale viewport selection frame')
      await rowClick(ids[0]); await escape(); equals(selected(), [], 'Escape did not clear list selection')
      checks.push('Empty viewport and Escape clear selection and its visible handles')

      await rowClick(ids[0]); await rowClick(ids[2], { shiftKey: true })
      const target = rows().find(row => row.dataset.virtualRow === ids[1])!
      target.dispatchEvent(new (realm().MouseEvent)('contextmenu', { bubbles: true, cancelable: true, clientX: 170, clientY: 240 }))
      await frames(); equals(selected(), ids.slice(0, 3), 'Right-click replaced the current multi-selection')
      const menuText = doc().querySelector('[role="menu"]')!.textContent!
      assert(menuText.includes('Delete 3 layers') && menuText.includes('Duplicate 3 layers') && menuText.includes('Group'), 'Menu does not describe the multi-selection')
      await click('Delete 3 layers')
      const deleted = await source()
      assert(ids.slice(0, 3).every(id => !deleted.layers.some(layer => layer.id === id)), 'Context delete left selected objects behind')
      equals(selected(), [], 'Delete retained stale selection')
      await click('↶'); equals(await source(), baseline, 'One Undo failed to restore complete scene/keys')
      await click('↷'); equals(await source(), deleted, 'Redo differs from the forest deletion')
      await click('↶')
      checks.push('Right-click retains the selection; bulk Delete and one Undo/Redo preserve exact source')

      await rowClick(ids[0]); await rowClick(ids[2], { shiftKey: true })
      doc().body.dispatchEvent(new (realm().KeyboardEvent)('keydown', { key: 'Delete', bubbles: true, cancelable: true }))
      await frames()
      const keyDeleted = await source()
      assert(ids.slice(0, 3).every(id => !keyDeleted.layers.some(layer => layer.id === id)), 'Keyboard Delete removed only the primary')
      await click('↶'); equals(await source(), baseline, 'Keyboard delete required more than one Undo')
      checks.push('Keyboard Delete removes the entire selection in one Undo step')

      await rowClick(ids[0]); await rowClick(ids[2], { shiftKey: true })
      await click('⊞ View ▾'); await escape()
      equals(selected(), ids.slice(0, 3), 'Menu Escape also cleared layer selection')
      await escape(); equals(selected(), [], 'Selection remained stuck after menu dismissal')
      checks.push('Escape dismisses a menu first, then clears layer selection')
      await activatePanel('sceneExplorer')
      const explorerRows = Array.from(doc().querySelectorAll<HTMLElement>('[role="tree"][aria-label="Scene Explorer"] [role="treeitem"]'))
      assert(explorerRows.length > 2, 'Scene Explorer rows missing')
      const explorerIds = explorerRows.slice(0, 3).map(row => row.getAttribute('data-virtual-row')!)
      explorerRows[0].dispatchEvent(new (realm().MouseEvent)('click', { bubbles: true })); await frames()
      const explorerLast = doc().querySelector<HTMLElement>(`[role="treeitem"][data-virtual-row="${explorerIds[2]}"]`)!
      explorerLast.dispatchEvent(new (realm().MouseEvent)('click', { bubbles: true, shiftKey: true })); await frames()
      const explorerSelected = Array.from(doc().querySelectorAll('[role="tree"][aria-label="Scene Explorer"] [role="treeitem"][aria-selected="true"]')).map(row => row.getAttribute('data-virtual-row'))
      equals(explorerSelected, explorerIds, 'Scene Explorer did not share displayed-order range selection')
      await escape()
      checks.push('Scene Explorer shares the same displayed-order selection contract')
      equals(await source(), baseline, 'Selection-only operations rewrote source/history')
      // Existing modal/real history, with no direct scene setter or mocked persistence.
      const compositionBefore = await source()
      const openComposition = async () => {
        const entry = doc().querySelector<HTMLButtonElement>('button[title="Canvas size & framerate"]')!
        assert(entry, 'Composition settings entry missing'); entry.click(); await frames()
        assert(doc().querySelector('dialog[aria-label="Composition settings"][open]'), 'Composition modal did not open')
      }
      const number = async (label: string, value: string) => {
        const input = doc().querySelector<HTMLInputElement>(`dialog input[aria-label="${label}"]`)!
        assert(input, `Missing composition field ${label}`)
        Object.getOwnPropertyDescriptor(realm().HTMLInputElement.prototype, 'value')!.set!.call(input, value)
        input.dispatchEvent(new (realm().Event)('input', { bubbles: true })); await frames()
      }
      await openComposition()
      const preset = doc().querySelector<HTMLSelectElement>('select[aria-label="Canvas preset"]')!
      preset.value = Array.from(preset.options).find(option => option.value !== 'custom')!.value
      preset.dispatchEvent(new (realm().Event)('change', { bubbles: true })); await frames()
      assert(doc().querySelector('dialog[open]'), 'Preset applied/closed before explicit Apply')
      await number('Composition duration seconds', '12.5'); await number('fps', '29.97')
      await click('Cancel'); equals(await source(), compositionBefore, 'Cancelled composition draft changed the scene')
      await openComposition(); await number('width', '8193')
      assert(Array.from(doc().querySelectorAll<HTMLButtonElement>('dialog button')).find(item => item.textContent === 'Apply')!.disabled, 'Invalid composition can be applied')
      await number('width', '1280'); await number('height', '720'); await number('Composition duration seconds', '12.5'); await number('fps', '29.97')
      await click('Apply')
      const compositionAfter = await source()
      assert(compositionAfter.composition.width === 1280 && compositionAfter.composition.height === 720 && compositionAfter.composition.durationMs === 12500 && compositionAfter.composition.frameRate === 29.97, 'Composition draft did not apply in source units')
      equals(compositionAfter.layers, compositionBefore.layers, 'Composition changed layer data')
      const durationControl = doc().querySelector<HTMLInputElement>('[aria-label="selected Timeline duration Ms"]')!
      assert(durationControl?.value === '12500', 'Active Timeline duration did not follow composition')
      const active = compositionAfter.timelines.find(timeline => timeline.durationMs === 12500)!
      assert(active, 'No Timeline synchronized with composition')
      equals(compositionAfter.timelines, compositionBefore.timelines.map(timeline => timeline.id === active.id ? { ...timeline, durationMs: 12500 } : timeline), 'Composition changed keys or unrelated Timelines')
      assert(doc().querySelector('[aria-label="Timeline frame rate"]')?.textContent === '29.97 fps', 'Timeline frame-rate display stayed stale')
      await click('Timeline start (Home)'); await click('Next frame (Right)')
      assert(doc().body.textContent?.includes('00:00.033'), 'Timeline frame navigation ignored fractional FPS')
      await click('↶'); equals(await source(), compositionBefore, 'Composition was not exactly one Undo')
      await click('↷'); equals(await source(), compositionAfter, 'Composition Redo lost settings')
      checks.push('Composition duration synchronizes active Timeline, fractional FPS changes frame navigation, and one Undo/Redo preserves keys')
      await openComposition(); await number('fps', '60'); await click('Apply')
      const fpsAfter = await source()
      equals(fpsAfter.timelines, compositionAfter.timelines, 'FPS-only edit changed Timeline durations or keys')
      assert(doc().querySelector('[aria-label="Timeline frame rate"]')?.textContent === '60 fps', 'Timeline FPS did not update to 60')
      await click('Timeline start (Home)'); await click('Next frame (Right)')
      assert(doc().body.textContent?.includes('00:00.017'), 'One frame at 60 FPS is not 16.67 ms')
      await click('+ Timeline')
      const withTimeline = await source(), added = withTimeline.timelines.find(timeline => !fpsAfter.timelines.some(before => before.id === timeline.id))
      assert(added?.durationMs === 12500 && added.tracks.length === 0, 'New Timeline did not inherit composition duration')
      await click('↶'); equals(await source(), fpsAfter, 'New Timeline Undo did not restore source')
      checks.push('New Timeline inherits composition duration without retiming existing Timelines')
      await click('↶'); equals(await source(), compositionAfter, 'FPS-only Undo did not restore exact source')
      await click('↶'); equals(await source(), compositionBefore, 'Timing updates did not restore their original source')
      checks.push('FPS-only change keeps all millisecond key data and durations; frame stepping uses 1000/FPS')
      for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) {
        frame.style.width = `${width}px`; frame.style.height = `${height}px`; await frames(5)
        const toolbar = doc().querySelector<HTMLElement>('[data-testid="editor-toolbar"]')!
        assert(toolbar.scrollWidth <= toolbar.clientWidth + 1 && doc().documentElement.scrollWidth <= width + 1, `Default selection controls overflow at ${width}`)
      }
      checks.push('Default region/containment controls fit 1280, 1440 and 1920 px desktops')
      frame.style.width = '1440px'; frame.style.height = '900px'; await frames(5)
      await activatePanel('layers'); await activatePanel('properties'); await escape()
      const beforeSpline = await source()
      await click('Add Layer'); await click('Spline Objects')
      const addSpline = doc().querySelector<HTMLButtonElement>('button[title="Add Line"]')!; assert(addSpline, 'Spline Line add entry missing'); addSpline.click(); await frames()
      const splineCanvas = doc().querySelector<HTMLCanvasElement>('canvas')!; assert(splineCanvas, 'Missing full editor canvas')
      const pointerAt = (type: string, x: number, y: number) => {
        const rect = splineCanvas.getBoundingClientRect(), event = new (realm().PointerEvent)(type, { bubbles: true, cancelable: true, pointerId: 19, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1,
          clientX: rect.left + x * rect.width / splineCanvas.width, clientY: rect.top + y * rect.height / splineCanvas.height })
        ;(type === 'pointerdown' ? splineCanvas : realm()).dispatchEvent(event)
      }
      for (const [x, y] of [[300, 150], [500, 150], [500, 300], [300, 150]]) { pointerAt('pointerdown', x, y); await frames(); pointerAt('pointerup', x, y); await frames() }
      const createdSpline = await source(), addedSpline = createdSpline.layers.find(layer => layer.type === 'spline' && !beforeSpline.layers.some(old => old.id === layer.id))
      if (!addedSpline?.spline) throw new Error('Native Add/Line clicks did not create a spline')
      await click('Spline point mode'); const vertex = Object.values(addedSpline.spline.points)[0], world = resolveLayerWorldMatrix(addedSpline, createdSpline, 0).applyToPoint(vertex)
      pointerAt('pointerdown', world.x, world.y); await frames(); pointerAt('pointerup', world.x, world.y); await frames()
      assert(doc().querySelector('[data-panel="spline-point"]'), 'Main Properties was not connected to viewport point selection')
      await click('Spline edge mode'); assert(doc().querySelector('[aria-label="Spline edge selection"]') && !doc().querySelector('[data-panel="spline-point"]'), 'Main Edge switch retained point inspector/overlay')
      await click('Spline object mode'); const sub = Object.values(addedSpline.spline.subShapes)[0]; await click(`Select spline object ${sub.name}`)
      assert(doc().querySelector('[aria-label="Spline object name"]') && doc().querySelector(`[data-spline-object-id="${sub.id}"][data-selected="true"]`), 'Main Object selection/Properties disconnected')
      equals(await source(), createdSpline, 'Main mode/selection UI mutated spline/key source')
      await click('Done'); await click('↶'); equals(await source(), beforeSpline, 'Sub-object UI added history or changed existing animations')
      checks.push('Actual EditorPage Add/Line drawing, three spline modes, viewport/Properties selection and one Undo preserve all existing source')
      status.textContent = `PASS · ${checks.length} checks`; report.textContent = JSON.stringify({ passed: true, checks }, null, 2)
    } catch (error) { status.textContent = 'FAIL'; report.textContent = JSON.stringify({ passed: false, error: String(error), checks }, null, 2) }
    finally { button.disabled = false }
  }
}
