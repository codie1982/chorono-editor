import { createRoot } from 'react-dom/client'
import { checkDrawingSettings } from './checkDrawingSettings'
import EditorPage from '@/app/page'
import { checkSplineToolsPanel, selectEditorTab } from '@/components/splineEdit/__tests__/checkSplineToolsPanel'

/** Real production EditorPage, isolated by this QA origin. The parent only
 * changes iframe dimensions and invokes visible native controls; no viewport,
 * pointer APIs, internal scene getters or React state are mocked. */
if (new URL(location.href).searchParams.has('subject')) {
  createRoot(document.getElementById('app')!).render(<EditorPage />)
} else {
  document.body.style.cssText = 'margin:16px;background:#030712;color:#e5e7eb;font:14px system-ui'
  const root = document.getElementById('app')!
  root.innerHTML = '<h1>Responsive editor acceptance</h1><p>Actual editor in a private QA origin. Resize controls change only this iframe.</p><button id="run-display">Run responsive checks</button><div id="presets" style="display:flex;gap:8px;margin:12px 0;flex-wrap:wrap"></div><p id="status">Ready</p><pre id="report" style="white-space:pre-wrap"></pre><iframe id="subject" title="Responsive Chorono editor" style="border:1px solid #475569;width:1024px;height:768px;display:block"></iframe>'
  const frame = document.getElementById('subject') as HTMLIFrameElement
  frame.style.boxSizing = 'content-box'
  frame.src = `${location.pathname}?subject=1`
  const sizes: [string, number, number][] = [['Phone', 390, 844], ['Small phone', 320, 568], ['Tablet portrait', 768, 1024], ['Tablet landscape', 1024, 768], ['Minimum desktop', 1280, 720], ['Laptop', 1440, 900], ['Large desktop', 1920, 1080], ['Short window', 1280, 600]]
  const resize = (width: number, height: number) => { frame.style.width = `${width}px`; frame.style.height = `${height}px` }
  for (const [label, width, height] of sizes) {
    const button = document.createElement('button'); button.textContent = `${label} · ${width}×${height}`
    button.onclick = () => resize(width, height); document.getElementById('presets')!.append(button)
  }
  const doc = () => frame.contentDocument!
  const realm = () => frame.contentWindow as Window & typeof globalThis
  const assert = (value: unknown, message: string) => { if (!value) throw new Error(message) }
  const frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise(requestAnimationFrame) }
  const until = async (test: () => boolean, label: string) => {
    const deadline = performance.now() + 15000
    while (!test() && performance.now() < deadline) await frames(1)
    assert(test(), label)
  }
  const click = async (label: string) => {
    const element = Array.from(doc().querySelectorAll<HTMLElement>('button,[role="menuitem"]')).find(item => item.getAttribute('aria-label') === label || item.textContent?.replace(/\s+/g, '') === label.replace(/\s+/g, ''))
    assert(element, `Missing ${label}`); element!.click(); await frames()
  }
  const source = async () => {
    await click('Project'); await click('Inspect Scene JSON…')
    await until(() => !!doc().querySelector('[aria-label="Project JSON"] pre')?.textContent?.startsWith('{'), 'JSON preview did not settle')
    const json = doc().querySelector('[aria-label="Project JSON"] pre')!.textContent!
    await click('Close JSON'); return json
  }
  const button = document.getElementById('run-display') as HTMLButtonElement
  button.onclick = async () => {
    button.disabled = true; const checks: unknown[] = [], status = document.getElementById('status')!, report = document.getElementById('report')!
    status.textContent = 'Running'
    const record = (name: string, evidence: unknown) => checks.push({ name, evidence })
    try {
      resize(1024, 768)
      await until(() => !!doc()?.querySelector('[data-editor-display="too-small"]'), 'Initial tablet notice missing')
      assert(!doc().querySelector('[data-testid="editor-toolbar"]'), 'Editor/recovery owner mounted on initial tablet load')
      record('Initial tablet viewport does not mount the production editor', { width: 1024, height: 768 })
      resize(1280, 720)
      await until(() => !!doc().querySelector('[data-testid="editor-toolbar"]'), 'Minimum desktop failed to open')
      await frames(5)
      const open = Array.from(doc().querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent?.trim() === 'Open editor')
      if (open) { open.click(); await frames(4) }
      const consent = doc().querySelector('[aria-label*="diagnostic"]')
      if (consent) throw new Error('Unexpected diagnostic dialog in a local unofficial QA build')
      const toolbar = doc().querySelector<HTMLElement>('[data-testid="editor-toolbar"]')!
      await selectEditorTab({ doc, realm, frames, assert }, 'layers')
      const initialSource = await source()
      const layer = Array.from(doc().querySelectorAll<HTMLElement>('[role="treeitem"]')).find(item => item.textContent?.includes('Chorono mark'))
      assert(layer, 'Native shape row missing'); layer!.click(); await frames(4)
      await selectEditorTab({ doc, realm, frames, assert }, 'properties')
      const input = doc().querySelector<HTMLInputElement>('input[aria-label="X"]')!
      assert(input, 'Native X field missing')
      const Input = realm().HTMLInputElement
      input.focus(); await frames()
      Object.getOwnPropertyDescriptor(Input.prototype, 'value')!.set!.call(input, String(Number(input.value) + 37))
      input.dispatchEvent(new (realm().Event)('input', { bubbles: true }))
      await frames()
      input.dispatchEvent(new (realm().KeyboardEvent)('keydown', { key: 'Enter', bubbles: true, cancelable: true })); input.blur(); await frames(3)
      const edited = await source(); assert(edited !== initialSource, 'Native edit did not write source/history')
      const history = doc().querySelector('[aria-label="Local recovery"]')!.getAttribute('title')
      record('1280×720 opens the actual editor and accepts a native manual edit', { toolbarWidth: toolbar.clientWidth })
      const play = doc().querySelector<HTMLButtonElement>('button[title^="Play / Pause"]')!
      play.dispatchEvent(new (realm().KeyboardEvent)('keydown', { key: ' ', bubbles: true, cancelable: true })); await frames(5)
      assert(play.textContent?.includes('Pause'), 'Playback did not start')
      for (const [label, width, height] of sizes.filter(([, w, h]) => w < 1280 || h < 720)) {
        resize(width, height); await until(() => !!doc().querySelector('[data-editor-display="too-small"]'), `${label} was not blocked`)
        await until(() => !doc().querySelector('button[title^="Play / Pause"]')?.textContent?.includes('Pause'), `${label} did not pause playback`)
        const workspace = doc().querySelector<HTMLElement>('[data-testid="editor-display-workspace"]')!
        assert(workspace.inert && workspace.getAttribute('aria-hidden') === 'true' && frame.contentWindow!.getComputedStyle(workspace).visibility === 'hidden', `${label} left the editor interactive`)
        assert(doc().querySelector('[data-testid="editor-toolbar"]') === toolbar, `${label} remounted the workspace`)
        assert(!doc().querySelector('button[title^="Play / Pause"]')?.textContent?.includes('Pause'), `${label} did not pause playback`)
        const before = doc().querySelector('[aria-label="Local recovery"]')!.getAttribute('title')
        doc().dispatchEvent(new (realm().KeyboardEvent)('keydown', { key: 'k', bubbles: true, cancelable: true })); await frames()
        assert(doc().querySelector('[aria-label="Local recovery"]')!.getAttribute('title') === before, `${label} allowed hidden keyboard editing`)
        record(`${label} is blocked without unmounting source/history`, { width, height })
      }
      resize(1440, 900); await until(() => !!doc().querySelector('[data-editor-display="supported"]'), 'Workspace did not resume after resize')
      assert(await source() === edited, 'Resizing changed manual source/key data')
      assert(doc().querySelector('[aria-label="Local recovery"]')!.getAttribute('title') === history, 'Resizing reset Undo/Redo/session ownership')
      assert(!doc().querySelector('button[title^="Play / Pause"]')?.textContent?.includes('Pause'), 'Resize automatically resumed playback')
      await click('↶'); assert(await source() === initialSource, 'Retained Undo did not restore exact source')
      await click('↷'); assert(await source() === edited, 'Retained Redo did not restore the manual edit')
      record('Returning to desktop retains scene, session, one-step Undo/Redo and paused transport', { restored: true })
      for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) {
        resize(width, height); await frames(5)
        assert(toolbar.scrollWidth <= toolbar.clientWidth + 1, `Toolbar overflows at ${width}`)
        assert(doc().documentElement.scrollWidth <= width + 1, `Page overflows at ${width}`)
        record('Supported desktop has no horizontal page/toolbar overflow', { width, height })
      }
      // S2D-1 integration: use the real page's Add palette and native pointer
      // events, then inspect source only through its public JSON dialog.
      await selectEditorTab({ doc, realm, frames, assert }, 'layers')
      const beforeSpline = JSON.parse(await source())
      const pointer = async (type: string, x: number, y: number) => {
        const canvas = doc().querySelector<HTMLCanvasElement>('[data-testid="canvas-workspace"] canvas')!
        const rect = canvas.getBoundingClientRect()
        const event = new (realm().PointerEvent)(type, { bubbles: true, cancelable: true, pointerId: 91, pointerType: 'mouse', isPrimary: true,
          button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: rect.left + x * rect.width / canvas.width, clientY: rect.top + y * rect.height / canvas.height })
        ;(type === 'pointerdown' ? canvas : realm()).dispatchEvent(event); await frames()
      }
      const draw = async (x: number, y: number) => { await pointer('pointerdown', x, y); await pointer('pointermove', x + 70, y + 50); await pointer('pointerup', x + 90, y + 65) }
      await click('+ Add'); await click('Spline Objects'); await click('Rectangle'); await draw(80, 310)
      const firstSpline = JSON.parse(await source()), createdSpline = firstSpline.layers.find((layer: { id: string }) => !beforeSpline.layers.some((old: { id: string }) => old.id === layer.id))
      assert(createdSpline?.type === 'spline' && firstSpline.layers.length === beforeSpline.layers.length + 1, 'Page Add failed to create a spline layer')
      assert(doc().querySelector('[aria-label="Spline object mode"]')?.getAttribute('aria-pressed') === 'true', 'New spline did not enter Object editing')
      assert(JSON.stringify(firstSpline.timelines) === JSON.stringify(beforeSpline.timelines), 'New spline changed existing animation')
      record('Page Add creates and focuses one spline layer without changing existing animations', { layerId: createdSpline.id })
      await click('+ Add'); await click('Circle'); await draw(200, 300)
      const appendedSpline = JSON.parse(await source()), compound = appendedSpline.layers.find((layer: { id: string }) => layer.id === createdSpline.id)
      assert(appendedSpline.layers.length === firstSpline.layers.length && Object.keys(compound.spline.subShapes).length === 2, 'Page Add during edit created another layer instead of an Object')
      assert(JSON.stringify(compound.transform) === JSON.stringify(createdSpline.transform) && JSON.stringify(compound.style) === JSON.stringify(createdSpline.style), 'Page append changed root transform or shared paint')
      record('Page Add during edit appends to the captured spline and keeps its outer transform and paint', { objects: 2 })
      await checkSplineToolsPanel({ doc, realm, frames, source, click, assert, record }, createdSpline.name)
      await click('↶'); const undoneAppend = JSON.parse(await source())
      assert(JSON.stringify(undoneAppend.layers) === JSON.stringify(firstSpline.layers), 'Page append was not one Undo')
      await click('Done'); await click('+ Add'); await click('Circle'); await draw(320, 300)
      const separateSpline = JSON.parse(await source())
      assert(separateSpline.layers.length === firstSpline.layers.length + 1, 'Add outside edit implicitly appended into the selected spline')
      record('Done restores ordinary Add as a separate layer; append remains one native Undo', { separateLayer: true })
      await click('↶'); await click('↶')
      const restoredSplineSource = JSON.parse(await source())
      assert(JSON.stringify(restoredSplineSource.layers) === JSON.stringify(beforeSpline.layers) && JSON.stringify(restoredSplineSource.timelines) === JSON.stringify(beforeSpline.timelines), 'Page spline checks did not preserve the original scene')
      record('Page spline creation and append Undo restore every original layer and animation', { restored: true })
      await checkDrawingSettings({ doc, realm, frames, source, click, assert, record })
      status.textContent = `PASS · ${checks.length} checks`; report.textContent = JSON.stringify({ passed: true, checks }, null, 2)
      resize(1440, 900)
    } catch (error) { status.textContent = 'FAIL'; report.textContent = JSON.stringify({ passed: false, error: String(error), checks }, null, 2) }
    finally { button.disabled = false }
  }
}
