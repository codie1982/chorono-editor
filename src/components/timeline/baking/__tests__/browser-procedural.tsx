import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { emptyScene, newRectLayer, newTextLayer, newTimeline, newParameterWire } from '@/lib/defaults'
import { DEFAULT_TIMELINE_SETTINGS, DEFAULT_TIMELINE_GHOST_SETTINGS } from '@/lib/types/editor'
import { TimelineHandle } from '@/lib/script/api/TimelineHandle'
import { useEditorState } from '@/app/hooks/useEditorState'
import { useInteractiveRuntime } from '@/app/hooks/useInteractiveRuntime'
import { useAssetCache } from '@/app/hooks/useAssetCache'
import { useSnapSettings } from '@/app/hooks/useSnapSettings'
import { makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import { makeAddParameterWireCmd } from '@/lib/editor/commands-interactive'
import TimelinePanel from '@/components/TimelinePanel'
import CurveEditor from '@/components/timeline/CurveEditor'
import SceneCanvas from '@/components/SceneCanvas'
import WireParameterModal from '@/components/wiring/WireParameterModal'
import WiringListPanel from '@/components/panels/WiringListPanel'
import ExpressionEditor from '@/components/panels/ExpressionEditor'
import { checkProcedural } from './checkProcedural'

/** Static source arranged through the actual script API command adapter.
 * No generated code is executed here. Sandbox equivalence is tested separately
 * through runSafeScript/QuickJS, never the legacy console or Node eval. */
function fixture() {
  let scene = emptyScene()
  const card = { ...newRectLayer(), id: 'hero', name: 'Manual hero', size: { width: 80, height: 60 } }
  const input = { ...newRectLayer(), id: 'input', hidden: true }
  const clock = { ...newTextLayer(), id: 'clock', name: 'Human clock · 09:05' }
  clock.text = { ...clock.text!, value: '09:05', fontSize: 20 }; clock.transform.x = 250; clock.transform.y = 30
  scene = { ...scene, layers: [card, input, clock], composition: { ...scene.composition, width: 400, height: 280, durationMs: 3000 },
    timelines: [{ ...newTimeline(), id: 'signal', autoplay: false, durationMs: 3000, layerIds: [] }] }
  const timeline = new TimelineHandle('signal', { resolveTimelineId: () => 'signal', host: { getScene: () => scene, applyCommand: command => { scene = command.execute(scene) } } })
  timeline.track('layers.hero.transform.x', { controller: { type: 'waveform', waveform: { shape: 'sine', amplitude: 50, frequency: 1 / Math.PI, phase: 0, offset: 100, duty: .5 } } })
  timeline.track('layers.hero.opacity', { keyframes: [{ id: 'manual-opacity-start', timeMs: 0, value: .5, easing: { type: 'easeOut' } }, { id: 'manual-opacity-end', timeMs: 3000, value: 1, easing: { type: 'hold' } }] })
  timeline.key('input', 'transform.x', 0, 0).key('input', 'transform.x', 1000, 84)
  scene.parameterWires = [newParameterWire({ id: 'manual-wire', source: { layerId: 'input', propertyPath: 'transform.x', valueType: 'number' },
    target: { layerId: 'hero', propertyPath: 'transform.rotationDeg', valueType: 'number' }, expression: 'source*2' })]
  return scene
}
const initial = fixture()

/** Actual editor, runtime, graph, timeline and wire controls in an isolated
 * document. Test controls only arrange source/revision edge cases. */
function Host() {
  const editor = useEditorState(initial), scene = editor.scene, assets = useAssetCache(scene.assets), snap = useSnapSettings()
  const runtime = useInteractiveRuntime(scene), frame = runtime.evaluateFrame(500)
  const [keys, setKeys] = useState(new Set<string>()), [settings, setSettings] = useState(DEFAULT_TIMELINE_SETTINGS)
  const [wireOpen, setWireOpen] = useState(false), [report, setReport] = useState('Ready')
  const [inline, setInline] = useState('source'), [commits, setCommits] = useState(0)
  const noop = () => {}
  const reset = () => { editor.resetScene(initial); setWireOpen(false); setKeys(new Set()); setInline('source'); setCommits(0) }
  return <main className="p-3 bg-gray-950 text-gray-200 min-h-screen">
    <h1 className="text-lg">E−1.5 · Procedural graph, safe expressions and editable bake</h1>
    <nav className="flex gap-3 text-xs my-2">
      <button data-action="reset" onClick={reset}>Reset fixture</button><button data-action="undo" onClick={editor.undo}>Undo</button><button data-action="redo" onClick={editor.redo}>Redo</button>
      <button data-action="wire" onClick={() => setWireOpen(true)}>Edit wire</button>
      <button data-action="external" onClick={() => { const hero = editor.getScene().layers[0]; editor.dispatchCommand(makeUpdateLayerCmd(hero.id, { name: 'Human updated hero' }, hero)) }}>External source edit</button>
      <button data-action="cycle" onClick={() => { const wire = editor.getScene().parameterWires![0]; editor.dispatchCommand(makeAddParameterWireCmd(newParameterWire({ id: 'cycle', source: wire.target, target: wire.source, expression: 'source' }))); setWireOpen(true) }}>Open cyclic wire</button>
      <button className="bg-blue-700 px-2 py-1" onClick={async () => { setReport('Running'); setReport(JSON.stringify(await checkProcedural(editor), null, 2)) }}>Run procedural checks</button>
    </nav>
    <output id="procedural-state" className="text-xs" data-x={frame.overrides.get('layers.hero.transform.x')} data-rotation={frame.overrides.get('layers.hero.transform.rotationDeg')} data-inline={inline} data-commits={commits}>
      Local 500 ms · x {Number(frame.overrides.get('layers.hero.transform.x')).toFixed(3)} · revision {editor.getRevision()} · inline commits {commits}
    </output>
    <div className="grid gap-3 my-3" style={{ gridTemplateColumns: '520px minmax(700px,1fr)' }}>
      <section style={{ height: 350 }} className="border border-gray-700"><SceneCanvas scene={scene} editor={editor} assets={assets} snap={snap}
        timeMs={500} overrides={frame.overrides} selectedLayerId="hero" onSelectLayer={noop} /></section>
      <section data-panel="Curve" style={{ height: 350 }} className="border border-gray-700 min-h-0">
        <CurveEditor scene={scene} editor={editor} selectedLayerId="hero" selectedTimelineId="signal" currentTimeMs={500} onTimeChange={noop} selectedKfIds={keys} onSelectKeyframes={setKeys} />
      </section>
      <section className="border border-gray-700 min-h-0 p-3" style={{ height: 380 }}>
        <h2 className="text-xs mb-2">Inline expression · evaluated source 42</h2>
        <ExpressionEditor expression={inline} sourceValue={42} onCommit={value => { setInline(value); setCommits(count => count + 1) }} />
        <WiringListPanel scene={scene} editor={editor} wireErrors={frame.wireErrors} onEditWire={() => setWireOpen(true)} onCreateWire={() => setWireOpen(true)} />
      </section>
      <section data-panel="Timeline" style={{ height: 380 }} className="border border-gray-700 min-h-0">
        <TimelinePanel scene={scene} editor={editor} settings={settings} onSettingsChange={setSettings} selectedLayerId="hero" selectedLayerIds={new Set(['hero'])}
          selectedTimelineId="signal" currentTimeMs={500} isPlaying={false} playbackSpeed={1} onTimeChange={noop} onPlayToggle={noop} onSelectTimeline={noop}
          selectedKfIds={keys} onSelectKeyframes={setKeys} onSelectLayer={noop} onToggleLayerFlag={noop} onPlaybackSpeedChange={noop}
          ghostSettings={DEFAULT_TIMELINE_GHOST_SETTINGS} onGhostUpdate={noop} onGhostToggle={noop} onGhostPreset={noop} />
      </section>
    </div>
    {wireOpen && <WireParameterModal scene={scene} editor={editor} existingWire={scene.parameterWires![0]} sourceOverrides={frame.wireSourceOverrides} paramValues={frame.paramValues} onClose={() => setWireOpen(false)} />}
    <pre id="procedural-report" className="text-xs whitespace-pre-wrap">{report}</pre>
  </main>
}
createRoot(document.getElementById('app')!).render(<Host />)
