import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { useEditorState } from '@/app/hooks/useEditorState'
import { useInteractiveRuntime } from '@/app/hooks/useInteractiveRuntime'
import { useAssetCache } from '@/app/hooks/useAssetCache'
import { useSnapSettings } from '@/app/hooks/useSnapSettings'
import SceneCanvas from '@/components/SceneCanvas'
import type { MCPHost } from '../../mcp/editor'
import type { AssetElementMap } from '../../asset/visual/AssetElementMap'
import { clipAcceptanceScene } from './clipAcceptanceScene'
import { checkClipFrames, type ClipFrameHost } from './checkClipFrames'
import '@/lib/registry/bootstrap'

const initial = clipAcceptanceScene(), settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
let viewportAssets: AssetElementMap | undefined

/** Dedicated native acceptance app. Actual editor/runtime/viewport hooks own
 * state and media; visible test controls own only this fixture. No connected
 * user project, persistence/recovery key or main application scene is touched.
 */
function Host() {
  const editor = useEditorState(initial), runtime = useInteractiveRuntime(editor.scene)
  const [time, setTime] = useState(0), [mounted, setMounted] = useState(true), [busy, setBusy] = useState(false)
  const [report, setReport] = useState<unknown>({ status: 'Ready' })
  const images = useRef<HTMLCanvasElement[]>([]), frame = runtime.evaluateFrame(time)
  const read = useRef({ editor, runtime, time, frame }); read.current = { editor, runtime, time, frame }
  const mcp = useMemo<MCPHost>(() => ({
    get editor() { return read.current.editor }, assets: new Map(), selectedTimelineId: 'outer',
    get currentTimeMs() { return read.current.time }, isPlaying: false,
    getLiveFrame: () => read.current.runtime.evaluateFrame(read.current.time), getRuntimeState: () => ({}),
    setRuntimeTest: () => {}, selectTimeline: () => {}, isolateTimelines: () => {}, seek: setTime, playToggle: () => {}, setSpeed: () => {},
    setParameter: () => {}, dispatchEvent: () => {},
  }), [])
  const host = useMemo<ClipFrameHost>(() => ({ mcp, evaluate: ms => read.current.runtime.evaluateFrame(ms),
    seek: async ms => { flushSync(() => setTime(ms)); await settle() },
    releaseViewport: async () => { flushSync(() => setMounted(false)); await settle() },
  }), [mcp])
  /** Compare actual mounted SceneCanvas pixels as well as the direct adapter.
   * Wait for demand readiness/invalidations; failure is not a placeholder pass.
   */
  const run = async () => {
    setBusy(true); setReport({ status: 'Running' }); flushSync(() => setMounted(true))
    try {
      await host.seek(500)
      const deadline = performance.now() + 10000
      while (!viewportAssets?.modelForAsset?.('shared-model')) {
        if (performance.now() > deadline) throw new Error('Native viewport model did not prepare.')
        await settle()
      }
      await settle()
      const viewport = document.querySelector<HTMLCanvasElement>('#native-viewport canvas')!
      const mountedPixels = viewport.getContext('2d')!.getImageData(0, 0, viewport.width, viewport.height).data
      const result = await checkClipFrames(host, images.current, mountedPixels)
      setReport(result)
    } catch (error) { setReport({ passed: false, error: error instanceof Error ? error.message : String(error) }) }
    finally { setBusy(false) }
  }
  return <main className="bg-gray-950 text-gray-200 min-h-screen p-4 font-sans">
    <h1 className="text-lg">3D-T2 · outer box + private clip acceptance</h1>
    <p className="text-sm text-gray-400">One GLB · independent copy · delayed live instance · looping and held clips</p>
    <div className="flex gap-3 items-center my-3">
      <button className="px-3 py-2 bg-sky-700 rounded" id="run" disabled={busy} onClick={run}>Run T2 acceptance</button>
      <label className="text-sm">Composition ms <input aria-label="Composition time" type="range" min={0} max={2400} value={time} disabled={busy} onChange={event => setTime(Number(event.target.value))} /></label>
      <output id="time">{time} ms</output>
      <button className="px-2 py-1 bg-gray-700 rounded" disabled={busy} onClick={() => setMounted(!mounted)}>{mounted ? 'Release viewport' : 'Show viewport'}</button>
    </div>
    <output id="source-state" className="block text-xs mb-3">Revision {editor.getRevision()} · Undo {editor.committedHistory.past.length} · outer and inner keys preserved</output>
    {mounted && <Viewport editor={editor} frame={frame} time={time} />}
    <section className="grid grid-cols-3 gap-3 mt-4" aria-label="Rendered comparison">
      {['Viewport adapter', 'MCP PNG', 'Raster PNG'].map((title, i) => <figure key={title}><figcaption className="text-sm mb-1">{title} · 1500 ms</figcaption><canvas aria-label={title} className="w-full border border-gray-600" ref={element => { if (element) images.current[i] = element }} /></figure>)}
    </section>
    <pre id="report" className="text-xs mt-4 whitespace-pre-wrap">{JSON.stringify(report, null, 2)}</pre>
  </main>
}

/** Mounting owns media leases; unmount releases them independently of jobs. */
function Viewport({ editor, frame, time }: { editor: ReturnType<typeof useEditorState>; frame: ReturnType<ReturnType<typeof useInteractiveRuntime>['evaluateFrame']>; time: number }) {
  const assets = useAssetCache(editor.scene.assets, { managed: true }), snap = useSnapSettings({ persist: false })
  useLayoutEffect(() => { viewportAssets = assets; return () => { viewportAssets = undefined } }, [assets])
  return <div id="native-viewport" className="h-[400px] border border-gray-700 flex">
    <SceneCanvas scene={editor.scene} editor={editor} assets={assets} snap={snap} timeMs={time} overrides={frame.overrides} paramValues={frame.paramValues}
      selectedLayerId={null} selectedLayerIds={new Set()} onSelectLayer={() => {}} previewMode />
  </div>
}

createRoot(document.getElementById('app')!).render(<Host />)
