import { useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { emptyScene, newRectLayer, newTextLayer, newTimeline } from '@/lib/defaults'
import { DEFAULT_TIMELINE_SETTINGS, DEFAULT_TIMELINE_GHOST_SETTINGS } from '@/lib/types/editor'
import { DEFAULT_WAVEFORM_PARAMS, type ChronoScene } from '@/lib/types'
import { useEditorState } from '@/app/hooks/useEditorState'
import { useKeyboard } from '@/app/hooks/useKeyboard'
import { useKeyframeClipboard } from '@/app/hooks/useKeyframeClipboard'
import { useInteractiveRuntime } from '@/app/hooks/useInteractiveRuntime'
import { useAssetCache } from '@/app/hooks/useAssetCache'
import { useSnapSettings } from '@/app/hooks/useSnapSettings'
import { useTimelineAuthoring } from '../useTimelineAuthoring'
import { makeSetTrackControllerCmd } from '@/lib/editor/commands-track'
import { makeBulkMoveKfCmd } from '@/lib/editor/commands-keyframe'
import { updateKfTimeMs } from '@/lib/timeline/keyframeOps'
import { attributeSourceChange } from '@/lib/editor/authoring/Attribution'
import SceneCanvas from '@/components/SceneCanvas'
import TimelinePanel from '@/components/TimelinePanel'
import CurveEditor from '@/components/timeline/CurveEditor'
import ToastContainer from '@/components/Toast/ToastContainer'
import { checkTimelineAuthoring } from './checkTimelineAuthoring'

/** Purpose-built source, never a user's scene or connected bridge. Hidden
 * shapes remain keyable; the manually named clock and original IDs/easing are
 * retained for exact source/history checks. Loop/work-area expose local-end
 * authoring separately from playback remapping in the real runtime adapter. */
function fixture(): ChronoScene {
  const source = emptyScene(), timeline = { ...newTimeline(), id: 'active', durationMs: 1000, autoplay: false, loop: true, workAreaInMs: 200, workAreaOutMs: 800 }
  const layers = Array.from({ length: 50 }, (_, i) => {
    const layer = newRectLayer(); layer.id = `hero-${i}`; layer.name = `Card ${i + 1}`
    layer.transform = { ...layer.transform, x: 0, y: i === 0 ? 45 : 145 }; layer.hidden = i > 1
    layer.size = { width: 90, height: 65 }
    layer.style = { ...layer.style, fill: { type: 'solid', color: i === 0 ? '#38bdf8' : '#fbbf24' } }
    return layer
  })
  const clock = newTextLayer(); clock.id = 'clock'; clock.name = 'Manual clock · 09:05'
  clock.text = { ...clock.text!, value: '09:05', fontSize: 24 }; clock.transform.x = 250; clock.transform.y = 20
  timeline.layerIds = ['hero-0', 'hero-1', 'clock']
  timeline.tracks = [0, 1].map(i => ({ target: `layers.hero-${i}.transform.x`, keyframes: [0, 100, 1000].map((timeMs, n) => ({
    id: `hero-${i}-key-${n}`, timeMs, value: timeMs / 10, easing: { type: 'linear' as const }, tangentMode: 'aligned' as const,
  })) }))
  return attributeSourceChange(source, { ...source, composition: { ...source.composition, width: 400, height: 280, durationMs: 1000, frameRate: 10, backgroundColor: '#101827' },
    layers: [...layers, clock], timelines: [timeline] }, { actor: { kind: 'human' }, transactionId: 'manual-fixture' })
}
const initial = fixture()

/** Real history, registry keyboard, clipboard, runtime evaluation, canvas,
 * Timeline and Curve Editor. Test buttons only arrange the isolated fixture;
 * feature checks invoke actual visible production controls. */
function Host() {
  const editor = useEditorState(initial), scene = editor.scene
  const [selected, setSelected] = useState(new Set(['hero-0', 'hero-1']))
  const [keys, setKeys] = useState(new Set<string>()), [time, setTime] = useState(500), [playing, setPlaying] = useState(false)
  const [settings, setSettings] = useState(DEFAULT_TIMELINE_SETTINGS), [report, setReport] = useState('Ready')
  const [dialog, setDialog] = useState(false), [error, setError] = useState('')
  const seeks = useRef(0), paused = (ms: number) => { seeks.current++; setPlaying(false); setTime(ms) }
  const authoring = useTimelineAuthoring({ scene, editor, timelineId: 'active', selectedId: 'hero-0', selectedIds: selected,
    selectedKeyIds: keys, currentTimeMs: time, isPlaying: playing, timeBasis: 'global', onSeek: paused })
  const clipboard = useKeyframeClipboard({ scene, selectedKfIds: keys, selectedTimelineId: 'active', currentTimeMs: authoring.localTimeMs,
    dispatchCommand: editor.dispatchCommand, collisionPolicy: authoring.collisionPolicy, onError: setError })
  const runtime = useInteractiveRuntime(scene, { playbackDriven: playing }), assets = useAssetCache(scene.assets), snap = useSnapSettings()
  const frame = useMemo(() => runtime.evaluateFrame(time, playing ? null : { timelineId: 'active', localTimeMs: authoring.localTimeMs }), [scene, time, playing, authoring.localTimeMs, runtime.evaluateFrame])
  const noop = () => {}
  useKeyboard({ onUndo: editor.undo, onRedo: editor.redo, onPlayToggle: () => setPlaying(value => !value), onStepBack: noop, onStepForward: noop,
    onDeleteSelected: noop, onDuplicateSelected: noop, onSetKey: () => authoring.setKey(), onTimelineNavigate: authoring.navigate,
    getContext: () => 'timeline', isTransactionActive: editor.isTransactionActive, onCopy: clipboard.copySelected,
    onPaste: () => { const ids = clipboard.pasteAtPlayhead(); if (ids.size) setKeys(ids) } })
  const reset = () => { editor.resetScene(initial); setSelected(new Set(['hero-0', 'hero-1'])); setKeys(new Set()); setTime(500); setPlaying(false); setError(''); authoring.dismiss(); authoring.setKeyset('all'); authoring.setCollisionPolicy('reject') }
  return <main className="p-3 bg-gray-950 text-gray-200 min-h-screen">
    <h1 className="text-lg">E−1.4 · Set Key and Timeline acceptance</h1>
    <nav className="flex gap-3 flex-wrap text-xs py-2">
      <button data-action="reset" onClick={reset}>Reset fixture</button>
      <button data-action="all-layers" onClick={() => setSelected(new Set(scene.layers.filter(layer => layer.id !== 'clock').map(layer => layer.id)))}>Select 50 layers</button>
      <button data-action="first-key" onClick={() => setKeys(new Set(['hero-0-key-0']))}>Select first key</button>
      <button data-action="pair" onClick={() => setKeys(new Set(['hero-0-key-0', 'hero-0-key-1']))}>Select first key pair</button>
      <button data-action="undo" onClick={editor.undo}>Undo</button><button data-action="redo" onClick={editor.redo}>Redo</button>
      <button data-action="seek500" onClick={() => paused(500)}>Seek 500</button>
      <button data-action="copy" onClick={clipboard.copySelected}>Copy keys</button><button data-action="paste" onClick={() => clipboard.pasteAtPlayhead()}>Paste keys</button>
      <button data-action="controller" onClick={() => editor.dispatchCommand(makeSetTrackControllerCmd('active', 'layers.hero-0.transform.x', undefined, { type: 'waveform', waveform: { ...DEFAULT_WAVEFORM_PARAMS } }))}>Drive first channel</button>
      <button data-action="dialog" onClick={() => setDialog(true)}>Open dialog</button>
      <button data-action="rejected-gesture" onClick={() => {
        const base = editor.getScene(); editor.beginTransaction(); editor.previewTransaction(updateKfTimeMs(base, 'active', 'layers.hero-0.transform.x', 'hero-0-key-0', 300))
        try { editor.commitTransaction(makeBulkMoveKfCmd([{ timelineId: 'active', target: 'layers.hero-0.transform.x', kfId: 'hero-0-key-0', fromMs: 0, toMs: 100 }])) } catch (failure) { setError((failure as Error).message) }
      }}>Rejected gesture</button>
      <button className="bg-blue-700 px-2 py-1" onClick={async () => { setReport('Running'); setReport(JSON.stringify(await checkTimelineAuthoring(editor), null, 2)) }}>Run authoring checks</button>
    </nav>
    <output id="authoring-state" data-time={authoring.localTimeMs} data-seeks={seeks.current} data-evaluated-x={frame.overrides.get('layers.hero-0.transform.x')}
      className="text-xs">Local time {authoring.localTimeMs.toFixed(3)} ms · revision {editor.getRevision()} · {playing ? 'Playing' : 'Paused'} · {selected.size} selected</output>
    {error && <p className="text-xs text-amber-300" id="clipboard-error">{error}</p>}
    <div className="grid gap-3 my-3" style={{ gridTemplateColumns: '500px minmax(700px,1fr)' }}>
      <section style={{ height: 410 }} data-panel="Canvas" className="border border-gray-700">
        <SceneCanvas scene={scene} editor={editor} assets={assets} snap={snap} selectedTimeline={scene.timelines[0]}
          selectedLayerId="hero-0" selectedLayerIds={selected} onSelectLayer={noop} timeMs={authoring.localTimeMs} overrides={frame.overrides} />
      </section>
      <section style={{ height: 650, gridRow: 'span 2' }} data-panel="Timeline" tabIndex={0} className="min-h-0 border border-gray-700">
        <TimelinePanel scene={scene} editor={editor} settings={settings} onSettingsChange={setSettings} authoring={authoring}
          selectedLayerId="hero-0" selectedLayerIds={selected} selectedTimelineId="active" selectedKfIds={keys} onSelectKeyframes={setKeys}
          currentTimeMs={authoring.localTimeMs} isPlaying={playing} playbackSpeed={1} onTimeChange={paused} onPlayToggle={() => setPlaying(value => !value)}
          onSelectTimeline={noop} onSelectLayer={noop} onToggleLayerFlag={noop} onPlaybackSpeedChange={noop}
          ghostSettings={DEFAULT_TIMELINE_GHOST_SETTINGS} onGhostUpdate={noop} onGhostToggle={noop} onGhostPreset={noop} />
      </section>
      <section style={{ height: 228 }} data-panel="Curve" className="border border-gray-700">
        <CurveEditor scene={scene} editor={editor} selectedLayerId="hero-0" selectedLayerIds={selected} selectedTimelineId="active"
          selectedKfIds={keys} onSelectKeyframes={setKeys} currentTimeMs={authoring.localTimeMs} onTimeChange={paused}
          collisionPolicy={authoring.collisionPolicy} onCollisionPolicyChange={authoring.setCollisionPolicy} />
      </section>
    </div>
    {dialog && <div role="dialog" aria-modal="true" className="fixed inset-0 bg-gray-900/95 z-50 p-20"><p>Dialog owns keyboard</p><button onClick={() => setDialog(false)}>Close dialog</button></div>}
    <pre id="authoring-report" className="text-xs whitespace-pre-wrap">{report}</pre><ToastContainer />
  </main>
}
createRoot(document.getElementById('app')!).render(<Host />)
