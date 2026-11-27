'use client'
import { useRef, useState } from 'react'
import type { ChronoScene, Keyframe, Track } from '@/lib/types'
import { DEFAULT_TIMELINE_SETTINGS } from '@/lib/types'
import { applyKeyframeBatch } from '@/lib/timeline/authoring/keyframeBatch'
import { makeBulkMoveKfCmd, makeDeleteKfCmd, makeMoveKfCmd, makeUpdateEasingCmd, makeUpdateKfValueCmd, type KfMove } from '@/lib/editor/commands-keyframe'
import TimelineRuler from '@/components/timeline/TimelineRuler'
import TimelineKeyframe from '@/components/timeline/TimelineKeyframe'
import KeyframeSpreadsheet from '@/components/timeline/KeyframeSpreadsheet'
import { useTimelineViewport } from '@/components/timeline/hooks/useTimelineViewport'
import { useKeyframeDrag } from '@/components/timeline/hooks/useKeyframeDrag'
import type { ModelClipEditor } from './ModelContentTimeline'
import { detailButton } from './DetailWorkspaceShell'
import { modelTrackPresentation } from '@/lib/model3d/animation/modelTrackPresentation'
import type { ModelSelection } from '@/lib/model3d/inspection/types'
import { PRIMITIVE_SELECTION_INSTANCE } from '@/lib/model3d/modeling/poly/primitiveSource'
import { modelPathFromTrack, modelSelectionName, modelTrackBelongsToSelection } from '@/lib/model3d/animation/modelTrackScope'

type KeyRow = { kind: 'group' | 'section'; id: string; label: string; tracks: Track[] }
  | { kind: 'track'; id: string; label: string; track: Track; color: string }

/** Reuses the main editor's ruler, captured-pointer key dragging, collision
 * policy, easing commands and numeric key sheet. Only this owner's bound clip
 * can be edited. Previews are cancelled on unmount; one gesture is one local
 * history step and never publishes a main-scene mutation.
 */
export function ModelContentKeys({ model, view = 'timeline', selection, onSelectObject }: { model: ModelClipEditor; view?: 'timeline' | 'dope'; selection?: ModelSelection; onSelectObject?(selection: ModelSelection): void }) {
  const { editor, timeline: clip, context, selectedKeys, setSelectedKeys, playback } = model
  const timeline = clip!, durationMs = timeline.durationMs
  const viewport = useTimelineViewport(durationMs)
  // Gesture-local index: avoid searching each track/key for every moving key
  // on each preview. Cleared with the gesture; never part of source/history.
  const base = useRef<{ scene: ChronoScene; keys: Map<string, Omit<KfMove, 'toMs'>> } | null>(null)
  const [sheet, setSheet] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const scopedTracks = timeline.tracks.filter(track => modelTrackBelongsToSelection(track.target, selection))
  const all = scopedTracks.flatMap(track => track.keyframes.map(kf => ({ track, kf })))
  const groups = new Map<string, Map<string, Track[]>>()
  for (const track of scopedTracks) {
    const path = modelPathFromTrack(track.target)!, label = modelTrackPresentation(model.previewLayer.model3d, path)
    if (query && !`${label.group} ${label.section} ${label.label}`.toLowerCase().includes(query.toLowerCase())) continue
    const sections = groups.get(label.group) ?? new Map<string, Track[]>()
    sections.set(label.section, [...(sections.get(label.section) ?? []), track]); groups.set(label.group, sections)
  }
  const selectedName = modelSelectionName(model.previewLayer.model3d, selection)
  if (selectedName && !groups.size) groups.set(selectedName, new Map())
  const rows: KeyRow[] = []
  for (const [group, sections] of Array.from(groups.entries())) {
    const groupId = `group:${group}`, groupTracks = Array.from(sections.values()).flat()
    rows.push({ kind: 'group', id: groupId, label: group, tracks: groupTracks })
    if (view === 'timeline' || collapsed.has(groupId)) continue
    for (const [section, tracks] of Array.from(sections.entries())) {
      const sectionId = `${groupId}:${section}`
      rows.push({ kind: 'section', id: sectionId, label: section, tracks })
      if (collapsed.has(sectionId)) continue
      for (const track of tracks) {
        const info = modelTrackPresentation(model.previewLayer.model3d, modelPathFromTrack(track.target)!)
        rows.push({ kind: 'track', id: track.target, label: `${info.label}${info.unit ? ` · ${info.unit}` : ''}`, track, color: info.color })
      }
    }
  }
  const toggle = (id: string) => setCollapsed(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next })
  const selectObject = (track: Track) => {
    const path = modelPathFromTrack(track.target)!, primitive = path.match(/^model3d\.modeling\.objectsById\.([^.]+)\./)
    const node = path.match(/^model3d\.content\.instances\.([^.]+)\.nodes\.([^.]+)\./)
    if (primitive) onSelectObject?.({ instanceId: PRIMITIVE_SELECTION_INSTANCE, nodeId: primitive[1] })
    else if (node) onSelectObject?.({ instanceId: node[1], nodeId: node[2] })
    else {
      const instance = path.match(/^model3d\.content\.instances\.([^.]+)\./)?.[1]
      const firstNode = instance && Object.keys(model.previewLayer.model3d?.content?.instances[instance]?.nodes ?? {})[0]
      if (instance && firstNode) onSelectObject?.({ instanceId: instance, nodeId: firstNode })
    }
  }
  const select = (id: string, shift: boolean) => setSelectedKeys(previous => {
    const next = shift ? new Set(previous) : new Set<string>(); next.has(id) ? next.delete(id) : next.add(id); return next
  })
  const drag = useKeyframeDrag({ timeline, durationMs, frameRate: editor.scene.composition.frameRate, settings: DEFAULT_TIMELINE_SETTINGS,
    clientXToMs: viewport.clientXToMs,
    onBegin: () => {
      playback.handlePause()
      const scene = editor.getCommittedScene(), keys = new Map<string, Omit<KfMove, 'toMs'>>()
      for (const track of scene.timelines.find(item => item.id === timeline.id)!.tracks) for (const key of track.keyframes) {
        keys.set(key.id, { timelineId: timeline.id, target: track.target, kfId: key.id, fromMs: key.timeMs })
      }
      base.current = { scene, keys }; editor.beginTransaction()
    },
    onPreview: moves => {
      if (!base.current) return
      const snapshot = base.current
      try { editor.previewTransaction(applyKeyframeBatch(snapshot.scene, { moves: Object.entries(moves).map(([id, toMs]) => ({ ...snapshot.keys.get(id)!, toMs })) }, { context })) }
      catch (failure) { model.setError(failure instanceof Error ? failure.message : String(failure)) }
    },
    onCommit: moves => {
      try { editor.commitTransaction(makeBulkMoveKfCmd(moves.map(move => ({ ...move, target: move.trackTarget })), { context })) }
      catch (failure) { editor.cancelTransaction(); model.setError(failure instanceof Error ? failure.message : String(failure)) }
      base.current = null
    },
    onCancel: () => { editor.cancelTransaction(); base.current = null }, onLoneClick: select,
  })
  const remove = (target: string, kf: Keyframe) => editor.dispatchCommand(makeDeleteKfCmd(timeline.id, target, kf, context))
  const easing = (target: string, kf: Keyframe, type: Keyframe['easing']['type']) => editor.dispatchCommand(makeUpdateEasingCmd(timeline.id, target, kf.id, kf.easing,
    type === 'customBezier' ? { type, bezier: kf.easing.bezier ?? { cx1: .25, cy1: .1, cx2: .25, cy2: 1 } } : { type }, context))
  const trackLabel = (track: Track) => { const info = modelTrackPresentation(model.previewLayer.model3d, modelPathFromTrack(track.target)!); return `${info.group} · ${info.section} · ${info.label}` }
  return <div className="flex h-full min-h-0 flex-col bg-[#0b1423] text-slate-200">
    <div className="flex shrink-0 items-center gap-2 border-b border-slate-700/70 px-3 py-1">
      <span className="font-medium text-cyan-200">{selection ? selectedName ?? 'Selected object' : '3D scene overview'}</span>
      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">{scopedTracks.length} channels · {all.length} keys</span>
      <button className={detailButton} disabled={!all.length} onClick={() => setSelectedKeys(new Set(all.map(item => item.kf.id)))}>Select keys</button>
      <button className={detailButton} disabled={!selectedKeys.size} aria-pressed={sheet} onClick={() => setSheet(!sheet)}>Key properties</button>
      <span className="hidden text-slate-400 lg:inline">{selectedKeys.size} selected · Shift click to add · drag to retime</span>
      {view === 'dope' && <input aria-label="Search 3D channels" value={query} onChange={event => setQuery(event.target.value)}
        className="ml-auto min-w-0 w-40 rounded border border-slate-600 bg-[#101b2d] px-2 py-1 text-slate-100 focus-visible:outline-2 focus-visible:outline-cyan-300" placeholder="Find 3D channel" />}
      <div className="ml-auto flex items-center gap-1" role="group" aria-label="Timeline zoom">
        <button className={detailButton} aria-label="Zoom out timeline" disabled={viewport.zoomFactor <= 1} onClick={() => viewport.setZoomFactor(viewport.zoomFactor / 1.5)}>−</button>
        <button className={detailButton} aria-label="Fit timeline" onClick={() => { viewport.setZoomFactor(1); viewport.setScrollLeftPx(0) }}>Fit</button>
        <button className={detailButton} aria-label="Zoom in timeline" onClick={() => viewport.setZoomFactor(viewport.zoomFactor * 1.5)}>+</button>
      </div>
    </div>
    <div className="flex min-h-0 flex-1 overflow-y-auto">
      <div className="w-64 shrink-0 border-r border-slate-700/70 text-slate-200"><div className="h-6 border-b border-slate-700/70 bg-[#101b2d] px-2 text-[10px] leading-6 uppercase tracking-wider text-slate-400">Object / animated property</div>{rows.map(row => row.kind === 'track'
        ? <button key={row.id} type="button" onClick={() => selectObject(row.track)} className={`flex h-7 w-full items-center gap-2 truncate border-t border-slate-800 text-left hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-cyan-300 ${view === 'dope' ? 'pl-8' : 'pl-3'}`} title={row.label}>
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} /><span className="truncate">{row.label}</span><span className="ml-auto shrink-0 pr-2 text-[10px] text-slate-400">{row.track.keyframes.length}</span></button>
        : <button key={row.id} type="button" aria-expanded={!collapsed.has(row.id)} onClick={() => toggle(row.id)}
          className={`flex h-7 w-full items-center truncate border-t border-slate-700 bg-[#14243a] text-left font-medium hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-cyan-300 ${row.kind === 'section' ? 'pl-5 text-slate-300' : 'pl-2 text-cyan-200'}`}>
          <span aria-hidden="true" className="mr-2">{collapsed.has(row.id) ? '▸' : '▾'}</span><span className="truncate">{row.label}</span><span className="ml-auto shrink-0 pr-2 text-[10px] text-slate-400">{row.tracks.length}</span></button>)}
      </div>
      <div ref={viewport.trackAreaRef} className="min-w-0 flex-1 overflow-hidden" onWheel={viewport.onWheel}>
        <TimelineRuler durationMs={durationMs} currentTimeMs={playback.currentTimeMs} totalContentPx={viewport.totalContentPx}
          scrollLeftPx={viewport.scrollLeftPx} msToScreenPx={viewport.msToScreenPx} clientXToMs={viewport.clientXToMs} onSeek={playback.handleSeek} />
        {rows.map(row => <div key={row.id} className={`relative h-7 border-t ${row.kind === 'track' ? 'border-gray-800' : 'border-slate-700 bg-[#14243a]'}`}>
          <span className="absolute inset-y-0 w-px bg-sky-400 pointer-events-none" style={{ left: viewport.msToScreenPx(playback.currentTimeMs) }} />
          {row.kind !== 'track' ? Array.from(new Set(row.tracks.flatMap(track => track.keyframes.map(key => key.timeMs)))).map(timeMs => {
            const ids = row.tracks.flatMap(track => track.keyframes.filter(key => key.timeMs === timeMs).map(key => key.id))
            return <button key={timeMs} type="button" aria-label={`${ids.length} keys at ${timeMs} ms in ${row.label}`}
              title={`${ids.length} keys · ${timeMs} ms`} onClick={() => setSelectedKeys(new Set(ids))}
              className="absolute top-2 h-2 w-2 rotate-45 border border-amber-200 bg-amber-400 focus-visible:outline-2 focus-visible:outline-cyan-300"
              style={{ left: viewport.msToScreenPx(timeMs) - 4 }} />
          }) : row.track.keyframes.map(kf => <TimelineKeyframe key={kf.id} kf={kf} x={viewport.msToScreenPx(kf.timeMs)} isSelected={selectedKeys.has(kf.id)} isDragging={drag.previewMs[kf.id] !== undefined}
            onSelect={shift => select(kf.id, shift)} onDelete={() => remove(row.track.target, kf)} onSetEasing={type => easing(row.track.target, kf, type)} onDoubleClick={() => { setSelectedKeys(new Set([kf.id])); setSheet(true) }}
            onPointerDown={event => {
              if (event.button !== 0) return
              const group = selectedKeys.has(kf.id) ? all.filter(item => selectedKeys.has(item.kf.id)) : [{ track: row.track, kf }]
              drag.beginDrag(event, { kfId: kf.id, trackTarget: row.track.target, timelineId: timeline.id, originalMs: kf.timeMs }, group.map(item => ({ kfId: item.kf.id, trackTarget: item.track.target, timelineId: timeline.id, originalMs: item.kf.timeMs })))
            }} />)}
        </div>)}
        {!all.length && <p className="px-3 py-3 text-slate-400">{selection ? 'This object has no keys in this clip. Set a key on one of its properties.' : 'Select a 3D object or set scene and camera keys.'}</p>}
      </div>
    </div>
    {sheet && <div className="max-h-40 shrink-0 overflow-auto border-t border-slate-700"><KeyframeSpreadsheet rows={all.filter(({ kf }) => selectedKeys.has(kf.id)).map(({ track, kf }) => ({
      kfId: kf.id, trackTarget: track.target,
      label: trackLabel(track),
      timeMs: kf.timeMs, value: typeof kf.value === 'number' ? kf.value : null, easingType: kf.easing.type,
    }))} onClose={() => setSheet(false)}
      onUpdateTime={(id, target, from, to) => editor.dispatchCommand(makeMoveKfCmd(timeline.id, target, id, from, to, context))}
      onUpdateValue={(id, target, from, to) => editor.dispatchCommand(makeUpdateKfValueCmd(timeline.id, target, id, from, to, context))}
      onUpdateEasing={(id, target, type) => { const item = all.find(item => item.kf.id === id); if (item) easing(target, item.kf, type) }}
      onDelete={(id, target) => { const item = all.find(item => item.kf.id === id); if (item) remove(target, item.kf) }} />
    </div>}
  </div>
}
