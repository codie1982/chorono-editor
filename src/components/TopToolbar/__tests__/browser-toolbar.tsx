import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import ProjectMenu from '../ProjectMenu'
import { InteractivePreviewButton } from '../InteractivePreviewButton'
import { flushSync } from 'react-dom'
import SceneCanvas from '../../SceneCanvas'
import { useEditorState } from '@/app/hooks/useEditorState'
import { useAssetCache } from '@/app/hooks/useAssetCache'
import { useSnapSettings } from '@/app/hooks/useSnapSettings'
import { makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import { emptyScene, newSplineLayerFromData, newTimeline } from '@/lib/defaults'
import { createPolylineSpline } from '@/lib/spline'
import { LayerIsolationBar } from '../../layerHierarchy/LayerFocusControls'
import type { ToolMode } from '../ToolGroup'

/** Real toolbar/Canvas integration on a synthetic source, without autosave,
 * filesystem writes or a user editor bridge. Visible counters verify action
 * routing; JSON source/history makes pointer/undo preservation reviewable. */
function Host() {
  const initial = useRef((() => {
    const scene = emptyScene(); scene.composition = { ...scene.composition, width: 480, height: 320 }
    const layer = newSplineLayerFromData(createPolylineSpline([{ x: 0, y: 0 }, { x: 80, y: 0 }], false), { name: 'Editable spline', x: 120, y: 120, openPath: true })
    scene.layers = [{ ...layer, id: 'spline' }]
    const timeline = newTimeline(); scene.timelines = [{ ...timeline, id: 'intro', durationMs: 1000, layerIds: ['spline'], tracks: [{ target: 'layers.spline.opacity', keyframes: [
      { id: 'manual-0', timeMs: 0, value: 1, easing: { type: 'hold' } }, { id: 'manual-1', timeMs: 1000, value: .6, easing: { type: 'linear' } },
    ] }] }]
    return scene
  })())
  const editor = useEditorState(initial.current), scene = editor.scene, assets = useAssetCache(scene.assets), snap = useSnapSettings({ persist: false })
  const [selected, setSelected] = useState<string | null>('spline'), [mode, setMode] = useState<ToolMode>('select')
  const [action, setAction] = useState('None'), [calls, setCalls] = useState(0)
  const choose = (name: string) => () => { setAction(name); setCalls(value => value + 1) }
  const [supported, setSupported] = useState(true)
  const [preview, setPreview] = useState(false)
  const [hostHeight, setHostHeight] = useState(600), [blockHost, setBlockHost] = useState(false), [isolated, setIsolated] = useState(false)
  return <main className="min-h-screen bg-gray-950 text-gray-100 p-4">
    <header className="flex items-center gap-2 mb-4">
      <h1 className="mr-auto">Toolbar and spline interaction acceptance</h1>
      <ProjectMenu mounted state={supported ? 'no-directory' : 'unsupported'} directoryName={null} lastSavedAt={null} snapshotCount={0}
        isSupported={supported} onPickDirectory={choose('Folder')} onSaveSnapshot={choose('Version')} onSaveSceneJson={choose('Save')}
        onCopySceneJson={choose('Copy')} onInspectJson={choose('Inspect')}
        exports={{ onExportRuntime: choose('Runtime'), onExportImage: choose('Image'), onExportSvg: choose('SVG'), onExportSequence: choose('Sequence'), onExportHtml: choose('HTML') }} />
      <InteractivePreviewButton layers={scene.layers} active={preview} onToggle={() => setPreview(value => !value)} />
    </header>
    <div className="flex gap-3 mb-3">
      <button onClick={() => setHostHeight(height => height === 600 ? 360 : 600)}>Resize Canvas host</button>
      <button onClick={() => setBlockHost(value => !value)}>Toggle block host</button>
      <button onClick={() => setIsolated(value => !value)}>Toggle isolation bar</button>
      <button onClick={() => setSelected(null)}>Clear selection</button>
      <button onClick={() => setSelected('spline')}>Select spline</button>
      <button onClick={editor.undo}>Undo</button><button onClick={editor.redo}>Redo</button>
      <button onClick={() => setSupported(value => !value)}>Toggle folder support</button>
      <button onClick={() => { const layer = editor.getScene().layers[0]; editor.dispatchCommand(makeUpdateLayerCmd(layer.id, { name: `${layer.name} edited` }, layer)) }}>External edit</button>
      <button onClick={() => { const layer = editor.getScene().layers[0]; editor.dispatchCommand(makeUpdateLayerCmd(layer.id, { tappable: true }, layer)) }}>Enable interaction</button>
      <button onClick={() => { void toolbarChecks() }}>Run toolbar checks</button>
    </div>
    <p role="status">Last action: {action} · Calls: {calls} · Tool: {mode}</p>
    <div data-testid="canvas-layout-host" style={{ height: hostHeight }} className="flex min-h-0 border border-gray-700 mt-2">
      <div className="h-full min-h-0 flex flex-1 flex-col">
        <LayerIsolationBar count={isolated ? 1 : 0} onExit={() => setIsolated(false)} />
        <div className={`${blockHost ? '' : 'flex'} flex-1 min-h-0 min-w-0`}>
      <SceneCanvas scene={scene} editor={editor} timeMs={0} selectedLayerId={selected}
        previewMode={preview} onLayerClickInPreview={choose('Tap')}
        selectedLayerIds={new Set(selected ? [selected] : [])} assets={assets} onSelectLayer={id => setSelected(id)}
        selectedTimeline={scene.timelines[0]} toolMode={mode} onToolModeChange={setMode} snap={snap}
        splineDrawKind={mode === 'spline-draw' ? 'line' : null} splineAppendTargetId={selected}
        onDrawSplineLine={id => { setSelected(id); setMode('spline-draw') }} onSplineDrawCommit={() => setMode('select')} />
        </div>
      </div>
    </div>
    <pre id="source" className="text-xs whitespace-pre-wrap mt-4">{JSON.stringify(scene, null, 2)}</pre>
    <pre id="toolbar-report" className="text-xs whitespace-pre-wrap">Ready</pre>
  </main>
}

/** Native presentation commands and real viewport hit testing validate the
 * consolidated menu and distinguish interactive preview from Timeline Play. */
async function toolbarChecks() {
  const report = document.getElementById('toolbar-report')!, checks: string[] = []
  const frames = async () => { for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame) }
  const button = (name: string) => {
    const node = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent?.trim() === name)
    if (!node) throw new Error('Missing button ' + name); return node
  }
  const click = async (name: string) => { flushSync(() => button(name).click()); await frames() }
  const assert = (value: unknown, message: string) => { if (!value) throw new Error(message) }
  try {
    const source = document.getElementById('source')!.textContent
    assert(!Array.from(document.querySelectorAll('header button')).some(node => ['Preview', 'Export', 'Interact'].includes(node.textContent!.trim())), 'No-op toolbar actions remain')
    for (const [label, action] of [['Inspect Scene JSON…', 'Inspect'], ['Runtime JSON (lean)', 'Runtime'], ['Image (PNG / WEBP / JPEG)…', 'Image'], ['SVG (vector)…', 'SVG'], ['Image Sequence (ZIP)…', 'Sequence'], ['Standalone HTML (self-playing)', 'HTML']]) {
      await click('Project'); await click(label)
      assert(document.querySelector('[role="status"]')!.textContent!.includes('Last action: ' + action), 'Project routed wrong action')
    }
    assert(document.getElementById('source')!.textContent === source, 'Menu actions changed scene source')
    checks.push('Project exposes all export/inspection callbacks without a second toolbar button or source mutation')
    await click('Enable interaction'); await click('Interact')
    const before = document.getElementById('source')!.textContent
    assert(button('Exit interaction').getAttribute('aria-pressed') === 'true', 'Interaction mode did not enter')
    const canvas = document.querySelector('canvas')!, rect = canvas.getBoundingClientRect()
    flushSync(() => canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'mouse', pointerId: 1, button: 0, buttons: 1,
      clientX: rect.left + 160 * rect.width / canvas.width, clientY: rect.top + 120 * rect.height / canvas.height })))
    await frames()
    assert(document.querySelector('[role="status"]')!.textContent!.includes('Last action: Tap'), 'Interactive preview did not dispatch a real layer tap')
    await click('Exit interaction')
    assert(document.getElementById('source')!.textContent === before, 'Interaction preview changed authored source')
    checks.push('Interact appears for tappable content, dispatches a real viewport tap, exits and preserves source')
    report.textContent = JSON.stringify({ passed: true, checks }, null, 2)
  } catch (error) { report.textContent = JSON.stringify({ passed: false, error: String(error), checks }, null, 2) }
}
createRoot(document.getElementById('app')!).render(<Host />)
