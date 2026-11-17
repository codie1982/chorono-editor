'use client'
import { useEffect, useState } from 'react'
import type { Timeline } from '@/lib/types'
import { addModelClip, type ModelClipDraft } from '@/lib/editor/detail'
import { modelChannels } from '@/lib/model3d/animation/modelChannels'
import { MODEL_CONTENT_PATHS } from '@/lib/model3d/animation/modelChannels'
import { modelTrackPresentation } from '@/lib/model3d/animation/modelTrackPresentation'
import { PRIMITIVE_SELECTION_INSTANCE } from '@/lib/model3d/modeling/poly/primitiveSource'
import type { ModelSelection } from '@/lib/model3d/inspection/types'
import { MAX_MODEL_CLIPS } from '@/lib/model3d/animation/ModelContentAnimation'
import { makeKeyframeLayerSnapshotCmd } from '@/lib/editor/commands-keyframe'
import ScrubInput from '@/components/inputs/ScrubInput'
import { detailButton } from './DetailWorkspaceShell'
import { ModelContentKeys } from './ModelContentKeys'
import { ModelCurveEditor } from './ModelCurveEditor'
import { modelSelectionName } from '@/lib/model3d/animation/modelTrackScope'
import type { useModelClipEditor } from './useModelClipEditor'

export type ModelClipEditor = ReturnType<typeof useModelClipEditor>
const input = 'bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs min-w-0'
const compactButton = `${detailButton} !px-2 !py-1`

/** Compact, private clip controls. Lifecycle edits use the same local command
 * history as keys; shortening a clip never silently trims existing keys. Clip
 * selection is a preview choice; only Use in scene changes the saved default.
 */
export function ModelContentTimeline({ content, model, selection, onSelectObject }: { content: ModelClipDraft; model: ModelClipEditor; selection?: ModelSelection; onSelectObject?(selection: ModelSelection): void }) {
  const { editor, timeline, playback, context } = model
  const channels = modelChannels(model.previewLayer.model3d)
  const data = model.previewLayer.model3d
  const [channel, setChannel] = useState('selected')
  const [view, setView] = useState<'timeline' | 'dope' | 'curve'>('timeline')
  const { setSelectedKeys } = model
  useEffect(() => { setChannel('selected'); setSelectedKeys(new Set()) }, [selection?.instanceId, selection?.nodeId, setSelectedKeys])
  const targetPrefix = selection?.instanceId === PRIMITIVE_SELECTION_INSTANCE
    ? `model3d.modeling.objectsById.${selection.nodeId}.`
    : selection ? `model3d.content.instances.${selection.instanceId}.nodes.${selection.nodeId}.` : ''
  const selectedChannels = targetPrefix ? channels.filter(path => path.startsWith(targetPrefix))
    : channels.filter(path => MODEL_CONTENT_PATHS.includes(path))
  const effectiveChannel = channel === 'selected' || !selection || selectedChannels.includes(channel) ? channel : 'selected'
  const keyChannels = effectiveChannel === 'selected' ? selectedChannels : [effectiveChannel]
  const patch = (values: Partial<Timeline> & { name?: string }) => {
    playback.handlePause()
    model.change('Edit content clip', scene => ({ ...scene, timelines: scene.timelines.map(clip => clip.id === timeline?.id ? { ...clip, ...values } : clip) }))
  }
  return <section aria-label="Content Timeline" className="flex h-full min-h-0 flex-col bg-[#0b1423] text-slate-200 text-xs">
    <div className="flex shrink-0 items-center flex-wrap gap-2 border-b border-slate-700/70 bg-[#101b2d] px-3 py-1">
      <h2 className="mr-1 font-semibold text-cyan-200">3D Animation</h2>
      <select aria-label="Content clip" className={input} value={timeline?.id ?? ''} onChange={e => model.select(e.target.value)}>
        {!timeline && <option value="">No clip · static base</option>}
        {editor.scene.timelines.map(clip => <option key={clip.id} value={clip.id}>{(clip as Timeline & { name: string }).name}</option>)}
      </select>
      <button className={compactButton} disabled={editor.scene.timelines.length >= MAX_MODEL_CLIPS} onClick={() => {
        playback.handlePause(); const command = addModelClip(content); editor.dispatchCommand(command); model.select(command.clipId)
      }}>+ Clip</button>
      {timeline && <>
        <input key={`${timeline.id}:${(timeline as Timeline & { name: string }).name}`} aria-label="Clip name" className={`${input} w-28`} maxLength={120} defaultValue={(timeline as Timeline & { name: string }).name}
          onBlur={e => { if (e.target.value.trim() && e.target.value !== (timeline as Timeline & { name: string }).name) patch({ name: e.target.value.trim() }) }}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
        <label className="flex items-center gap-1">Duration<span className="w-20"><ScrubInput disableScrub fieldLabel="Clip duration (ms)" min={1} max={86400000} value={timeline.durationMs} onChange={durationMs => patch({ durationMs })} /></span><span className="text-slate-400">ms</span></label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={timeline.loop} onChange={e => patch({ loop: e.target.checked })} />Loop</label>
        <button className={compactButton} aria-pressed={editor.scene.initialState.activeClipId === timeline.id} onClick={() => model.change('Set default content clip', scene => ({ ...scene, initialState: { activeClipId: scene.initialState.activeClipId === timeline.id ? null : timeline.id } }))}>Use in scene</button>
        <button className={compactButton} onClick={() => {
          playback.handlePause(); model.change('Delete content clip', scene => ({ ...scene, timelines: scene.timelines.filter(clip => clip.id !== timeline.id),
            initialState: { activeClipId: scene.initialState.activeClipId === timeline.id ? null : scene.initialState.activeClipId } }))
        }}>Delete clip</button>
      </>}
    </div>
    {!timeline && model.previewLayer.model3d?.content && <div className="flex gap-2 items-center px-3 py-2">
      <button className={detailButton} onClick={playback.handlePlayToggle}>{playback.isPlaying ? 'Ⅱ Pause' : '▶ Play native preview'}</button>
      <input aria-label="Native preview time" className="flex-1" type="range" min={0} max={model.durationMs} value={playback.currentTimeMs} onChange={e => { playback.handlePause(); playback.handleSeek(Number(e.target.value)) }} />
      <span>{playback.currentTimeMs.toFixed(0)} ms</span>
    </div>}
    {timeline && context ? <>
      <div className="flex shrink-0 items-center flex-wrap gap-2 border-b border-slate-700/70 px-3 py-1">
        <button className={compactButton} aria-label={playback.isPlaying ? 'Pause content clip' : 'Play content clip'} onClick={playback.handlePlayToggle}>{playback.isPlaying ? 'Ⅱ Pause' : '▶ Play'}</button>
        <button className={compactButton} aria-label="Content clip start" onClick={() => playback.handleSeek(0)}>│◀</button>
        <button className={compactButton} aria-label="Content clip end" onClick={() => playback.handleSeek(timeline.durationMs)}>▶│</button>
        <span className="w-20"><ScrubInput disableScrub fieldLabel="Content time (ms)" value={playback.currentTimeMs} min={0} max={timeline.durationMs} onChange={playback.handleSeek} /></span>
        <span className="text-slate-400">/ {timeline.durationMs} ms</span>
        <span className="h-5 w-px bg-slate-700" aria-hidden="true" />
        <span className="max-w-44 truncate font-medium text-cyan-200" title={modelSelectionName(data, selection) ?? '3D scene'}>{modelSelectionName(data, selection) ?? '3D scene'}</span>
        <select aria-label="3D key channels" className={`${input} max-w-56`} value={effectiveChannel} onChange={e => setChannel(e.target.value)}>
          <option value="selected">{selection ? 'All selected object properties' : 'Scene & camera properties'}</option>
          {(selection ? selectedChannels : channels).map(path => { const item = modelTrackPresentation(data, path); return <option key={path} value={path}>{item.section} · {item.label}</option> })}
        </select>
        <button className={`${compactButton} !bg-amber-600 !text-black focus-visible:ring-2 focus-visible:ring-cyan-300`} disabled={!keyChannels.length} title={`Set ${keyChannels.length} 3D channel keys`} onClick={() => {
          playback.handlePause(); editor.dispatchCommand(makeKeyframeLayerSnapshotCmd(timeline.id, model.previewLayer, playback.currentTimeMs,
            keyChannels, context))
        }}>◆ Set Key</button>
      </div>
      <div role="tablist" aria-label="3D animation views" className="flex shrink-0 gap-1 border-b border-slate-700 bg-[#101b2d] px-3 py-1">
        {(['timeline', 'dope', 'curve'] as const).map(item => <button key={item} type="button" role="tab" aria-selected={view === item}
          className={`rounded px-3 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-cyan-300 ${view === item ? 'bg-cyan-800 text-white' : 'text-slate-200 hover:bg-slate-700'}`}
          onClick={() => setView(item)}>{item === 'dope' ? 'Dope Sheet' : item === 'curve' ? 'Curve Editor' : 'Timeline'}</button>)}
      </div>
      {view !== 'curve' ? <div role="tabpanel" className="min-h-0 flex-1" aria-label={view === 'dope' ? '3D Dope Sheet' : '3D Timeline'}><ModelContentKeys key={`${timeline.id}:${view}`} model={model} view={view} selection={selection} onSelectObject={onSelectObject} /></div> : <div role="tabpanel" className="min-h-0 flex-1" aria-label="3D Curve Editor">
        <ModelCurveEditor model={model} selection={selection} />
      </div>}
    </> : <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-slate-400">Create a 3D clip to animate the selected object. Its keyed properties appear here and in the Dope Sheet and Curve Editor.</div>}
  </section>
}
