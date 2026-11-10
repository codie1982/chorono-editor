import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Layer } from '@/lib/types'
import { DEFAULT_TRANSFORM } from '@/lib/defaults'
import LayerPanel from '@/components/LayerPanel'
import SceneExplorerPanel from '@/components/sceneExplorer/SceneExplorerPanel'

/** UI-only fixture: enough rows to unmount the primary selection, with two
 * nested collapsed branches. Never reads or writes the user's editor scene. */
const layers: Layer[] = Array.from({ length: 400 }, (_, i) => ({
  id: `root-${i}`, name: `Layer ${i}`, type: 'shape', shape: 'rect',
  transform: { ...DEFAULT_TRANSFORM }, opacity: 1, size: { width: 10, height: 10 },
}))
layers.splice(200, 0,
  { id: 'outer', name: 'Outer group', type: 'group', transform: { ...DEFAULT_TRANSFORM }, opacity: 1 },
  { id: 'inner', name: 'Inner group', type: 'group', parentId: 'outer', transform: { ...DEFAULT_TRANSFORM }, opacity: 1 },
  { ...layers[0], id: 'child', name: 'Nested object', parentId: 'inner' })

/** Mounts both real panels with one shared external selection, matching the
 * canvas-to-panel contract. The public test button drives normal DOM controls. */
function Host() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState(new Set<string>())
  const [tick, setTick] = useState(0), [report, setReport] = useState('Ready')
  const select = (id: string | null) => { setSelectedId(id); setSelectedIds(new Set(id ? [id] : [])) }
  const noop = () => {}
  return <main className="p-4 text-gray-200">
    <h1>Layer selection reveal regression</h1>
    <nav className="flex gap-4 py-3">
      {['root-0', 'root-399', 'outer', 'inner', 'child'].map(id =>
        <button key={id} data-select={id} onClick={() => select(id)}>Select {id}</button>)}
      <button data-action="tick" onClick={() => setTick(n => n + 1)}>Render tick</button>
      <button data-action="clear" onClick={() => select(null)}>Clear</button>
      <button onClick={async () => { setReport('Running'); setReport(JSON.stringify(await checks(), null, 2)) }}>Run selection checks</button>
    </nav>
    <output>Selected: {selectedId ?? 'none'} · Tick: {tick}</output>
    <div className="flex gap-4 mt-3">
      <section data-panel="Layers" style={{ width: 430, height: 440 }}>
        <LayerPanel layers={layers} selectedId={selectedId} selectedIds={selectedIds} onSelect={select}
          onAdd={noop} onAddImage={noop} onAddVideo={noop} onAddAudio={noop} onDelete={noop}
          onReorder={noop} onToggleFlag={noop} onRename={noop} />
      </section>
      <section data-panel="Explorer" style={{ width: 530, height: 440 }}>
        <SceneExplorerPanel layers={layers} timeline={null} selectedId={selectedId} selectedIds={selectedIds}
          onSelect={select} onRename={noop} onToggleFlag={noop} onMoveInTree={noop} />
      </section>
    </div>
    <pre id="reveal-report" className="whitespace-pre-wrap mt-4">{report}</pre>
  </main>
}

/** Allows React effects, native scroll events and the virtualizer RAF to settle. */
async function frames() { for (let i = 0; i < 8; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve())) }
/** Fails one acceptance case without hiding later results. */
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
/** Exercises selection from outside each list; checks actual scroll geometry,
 * highlighting, nested expansion, repeated selection, focus and idle stability. */
async function checks() {
  const results: { name: string; passed: boolean; error?: string }[] = []
  const panels = Array.from(document.querySelectorAll<HTMLElement>('[data-panel]'))
  const list = (panel: HTMLElement) => panel.querySelector<HTMLElement>('ul[aria-label="Layers"],[role="tree"]')!
  const row = (panel: HTMLElement, id: string) => Array.from(panel.querySelectorAll<HTMLElement>('[data-virtual-row]'))
    .find(node => node.dataset.virtualRow === id)
  const select = async (id: string) => { document.querySelector<HTMLButtonElement>(`[data-select="${id}"]`)!.click(); await frames() }
  const check = async (name: string, run: () => Promise<void>) => {
    try { await run(); results.push({ name, passed: true }) }
    catch (error) { results.push({ name, passed: false, error: String(error) }) }
  }
  const visible = (panel: HTMLElement, id: string) => {
    const element = row(panel, id), viewport = list(panel).getBoundingClientRect()
    assert(element, `${panel.dataset.panel}: ${id} is unmounted`)
    const rect = element.getBoundingClientRect()
    // Legacy list has 4px padding and 2px row margins; text must be wholly visible.
    assert(rect.top >= viewport.top - 4 && rect.bottom <= viewport.bottom + 4, `${panel.dataset.panel}: ${id} is outside viewport`)
    assert(element.className.includes('bg-blue-') || element.getAttribute('aria-selected') === 'true', `${id} is not highlighted`)
    assert(panel.querySelectorAll('[data-virtual-row]').length < 70, 'Selection disabled virtualization')
  }
  await check('offscreen selection, both stacking orders, no stolen focus', async () => {
    const control = document.querySelector<HTMLButtonElement>('[data-select="root-0"]')!
    control.focus()
    await select('root-0'); panels.forEach(panel => visible(panel, 'root-0'))
    assert(document.activeElement === control, 'Selection stole keyboard focus')
    await select('root-399'); panels.forEach(panel => visible(panel, 'root-399'))
  })
  await check('manual scroll remains free across render ticks', async () => {
    await select('root-0')
    panels.forEach(panel => { const el = list(panel); el.scrollTop = el.scrollHeight / 2; el.dispatchEvent(new Event('scroll')) })
    await frames()
    const positions = panels.map(panel => list(panel).scrollTop)
    document.querySelector<HTMLButtonElement>('[data-action="tick"]')!.click(); await frames()
    panels.forEach((panel, i) => assert(list(panel).scrollTop === positions[i], 'Idle render pulled the list back'))
  })
  await check('reselecting the same object reveals it again', async () => {
    await select('root-0'); panels.forEach(panel => visible(panel, 'root-0'))
  })
  await check('nested child expands both ancestors before revealing', async () => {
    await select('inner')
    for (const panel of panels) row(panel, 'inner')!.querySelector<HTMLButtonElement>('button[title="Collapse"]')!.click()
    await frames(); await select('outer')
    for (const panel of panels) row(panel, 'outer')!.querySelector<HTMLButtonElement>('button[title="Collapse"]')!.click()
    await frames()
    panels.forEach(panel => assert(!row(panel, 'child'), 'Collapsed child remained mounted'))
    await select('child'); panels.forEach(panel => visible(panel, 'child'))
  })
  await check('manual branch collapse is not undone by render ticks', async () => {
    for (const panel of panels) row(panel, 'outer')!.querySelector<HTMLButtonElement>('button[title="Collapse"]')!.click()
    await frames()
    document.querySelector<HTMLButtonElement>('[data-action="tick"]')!.click(); await frames()
    panels.forEach(panel => assert(!row(panel, 'child'), 'Idle render reopened the branch'))
    await select('child'); panels.forEach(panel => visible(panel, 'child'))
  })
  return { passed: results.every(result => result.passed), results }
}

createRoot(document.getElementById('app')!).render(<Host />)
