import { useLayoutEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { emptyScene, newRectLayer, newTimeline } from '@/lib/defaults'
import { useEditorState } from '@/app/hooks/useEditorState'
import { usePlayback } from '@/app/hooks/usePlayback'
import { useTimelineAuthoring } from '../useTimelineAuthoring'
import { keyframePlaybackRange } from '@/lib/timeline/keyframePlaybackRange'
import { evaluateTimelines } from '@/lib/evaluator'
import { DEFAULT_TIMELINE_SETTINGS, DEFAULT_TIMELINE_GHOST_SETTINGS } from '@/lib/types/editor'
import TimelinePanel from '@/components/TimelinePanel'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'

/** Deterministic private source; tests never connect/import a user's scene. */
function fixture() {
  const scene = emptyScene(), hero = newRectLayer(), timeline = newTimeline()
  hero.id = 'hero'; hero.name = 'Playback range demo'; timeline.id = 'active'; timeline.autoplay = false; timeline.loop = false; timeline.durationMs = 1000
  timeline.workAreaInMs = 600; timeline.workAreaOutMs = 900
  timeline.tracks = [{ target: 'layers.hero.transform.x', keyframes: [100.25, 350.75].map((timeMs, i) => ({ id: `key-${i}`, timeMs, value: i * 100, easing: { type: 'linear' as const } })) }]
  scene.layers = [hero]; scene.timelines = [timeline]; return scene
}
let live: { editor: EditorStateReturn; playback: ReturnType<typeof usePlayback>; x: number | undefined } | undefined
function Host() {
  const editor = useEditorState(fixture()), timeline = editor.scene.timelines[0]
  const range = useMemo(() => timeline.playKeyRange ? keyframePlaybackRange(timeline) : null, [timeline])
  const playback = usePlayback({ maxDuration: 1000, wrapAtEnd: timeline.loop, workAreaInMs: timeline.workAreaInMs, workAreaOutMs: timeline.workAreaOutMs, range })
  const [settings, setSettings] = useState(DEFAULT_TIMELINE_SETTINGS)
  const authoring = useTimelineAuthoring({ scene: editor.scene, editor, timelineId: timeline.id, selectedId: 'hero', selectedIds: new Set(['hero']),
    selectedKeyIds: new Set(), currentTimeMs: playback.currentTimeMs, isPlaying: playback.isPlaying, timeBasis: range ? 'local' : 'global', onSeek: playback.handleSeek })
  const x = evaluateTimelines(editor.scene.timelines, playback.currentTimeMs, range ? { timelineId: 'active', localTimeMs: playback.currentTimeMs } : null).get('layers.hero.transform.x') as number | undefined
  useLayoutEffect(() => { live = { editor, playback, x } })
  const noop = () => {}
  return <main className="p-3 bg-gray-950 text-gray-200 min-h-screen">
    <h1>First-to-last-key native playback</h1>
    <button id="run" className="bg-blue-600 p-2" onClick={() => void run()}>Run playback checks</button>
    <button onClick={editor.undo}>Undo</button><button onClick={editor.redo}>Redo</button>
    <output id="state">{playback.isPlaying ? 'Playing' : 'Paused'} · {playback.currentTimeMs.toFixed(2)} ms · x {x?.toFixed(2)}</output>
    <section className="h-[500px] flex flex-col border border-gray-700 mt-4">
      <TimelinePanel scene={editor.scene} editor={editor} authoring={authoring} settings={settings} onSettingsChange={setSettings}
        selectedLayerId="hero" selectedLayerIds={new Set(['hero'])} selectedTimelineId="active" selectedKfIds={new Set()} onSelectKeyframes={noop}
        currentTimeMs={authoring.localTimeMs} isPlaying={playback.isPlaying} playbackSpeed={1} onTimeChange={playback.handleSeek} onPlayToggle={playback.handlePlayToggle}
        onSelectTimeline={noop} onSelectLayer={noop} onToggleLayerFlag={noop} onPlaybackSpeedChange={playback.setPlaybackSpeed}
        ghostSettings={DEFAULT_TIMELINE_GHOST_SETTINGS} onGhostUpdate={noop} onGhostToggle={noop} onGhostPreset={noop} />
    </section><pre id="report" className="text-xs whitespace-pre-wrap">Ready</pre>
  </main>
}
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
async function frames(n = 2) { for (let i = 0; i < n; i++) await new Promise(requestAnimationFrame) }
function playButton() { return document.querySelector<HTMLButtonElement>('button[title^="Play / Pause"]')! }
async function menu() { flushSync(() => playButton().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))); await frames() }
async function toggle(label: string) {
  const input = Array.from(document.querySelectorAll('label')).find(item => item.textContent?.trim() === label)?.querySelector<HTMLInputElement>('input')
  assert(input && !input.disabled, `Missing enabled ${label}`); flushSync(() => input.click()); await frames()
}
async function play() { flushSync(() => playButton().dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))); await frames() }
async function until(predicate: () => boolean) {
  const deadline = performance.now() + 3000
  while (!predicate() && performance.now() < deadline) await frames(1)
  assert(predicate(), 'Playback deadline exceeded')
}
/** Real UI invokes the actual rAF clock; deterministic cycle arithmetic is also
 * covered by unit tests. Reads full source before/after to protect key identity. */
async function run() {
  const checks: string[] = [], report = document.getElementById('report')!, button = document.getElementById('run') as HTMLButtonElement
  button.disabled = true; report.textContent = 'Running'
  try {
    const initial = structuredClone(live!.editor.getScene()), tracks = JSON.stringify(initial.timelines[0].tracks)
    await menu(); await toggle('First to last key')
    assert(live!.editor.getScene().timelines[0].playKeyRange, 'Preference did not commit')
    flushSync(() => live!.editor.undo()); await frames(); assert(!live!.editor.getScene().timelines[0].playKeyRange, 'Preference undo failed')
    flushSync(() => live!.editor.redo()); await frames(); checks.push('Range preference has one Undo/Redo')
    flushSync(() => live!.playback.handleSeek(0)); await play()
    assert(live!.playback.currentTimeMs >= 100.25 && live!.playback.currentTimeMs <= 350.75, 'Play did not enter the key span')
    await until(() => !live!.playback.isPlaying)
    assert(live!.playback.currentTimeMs === 350.75 && live!.x === 100, 'Last key pose was skipped or remapped')
    checks.push('Actual playback starts at first key and stops on the last key pose')
    await menu(); await toggle('Loop'); await play()
    const samples: number[] = []; for (let i = 0; i < 45; i++) { await frames(1); samples.push(live!.playback.currentTimeMs) }
    assert(live!.playback.isPlaying && samples.every(t => t >= 100.25 && t < 350.75), 'Loop escaped the key span')
    assert(samples.some((t, i) => i > 0 && t < samples[i - 1]), 'Loop did not wrap')
    await play(); checks.push('Loop repeats only the key span')
    await menu(); await toggle('Ping-pong (↔)'); flushSync(() => live!.playback.handleSeek(100.25)); await play()
    const bounce: number[] = []; for (let i = 0; i < 40; i++) { await frames(1); bounce.push(live!.playback.currentTimeMs) }
    assert(bounce.every(t => t >= 100.25 && t <= 350.75) && bounce.some((t, i) => i > 0 && t < bounce[i - 1]), 'Ping-pong did not reverse within the range')
    await play(); checks.push('Ping-pong reverses within the key span')
    const current = live!.editor.getScene()
    assert(JSON.stringify(current.timelines[0].tracks) === tracks && JSON.stringify(current.layers) === JSON.stringify(initial.layers), 'Playback changed human key/layer data')
    assert(current.timelines[0].workAreaInMs === 600 && current.timelines[0].workAreaOutMs === 900 && current.timelines[0].durationMs === 1000, 'Range rewrote Work Area or duration')
    checks.push('Keys, layers, Work Area and duration remain unchanged')
    report.textContent = JSON.stringify({ passed: true, checks }, null, 2)
  } catch (error) { report.textContent = JSON.stringify({ passed: false, error: String(error), checks }, null, 2) }
  finally { live?.playback.handlePause(); button.disabled = false }
}
createRoot(document.getElementById('app')!).render(<Host />)
