'use client'
import { useMemo, useState } from 'react'
import CurveEditor from '@/components/timeline/CurveEditor'
import { isScalarNumericTrack } from '@/lib/animation/typedValues'
import { modelTrackPresentation } from '@/lib/model3d/animation/modelTrackPresentation'
import { modelPathFromTrack, modelSelectionName, modelTrackBelongsToSelection } from '@/lib/model3d/animation/modelTrackScope'
import type { ModelSelection } from '@/lib/model3d/inspection/types'
import type { ModelClipEditor } from './ModelContentTimeline'

/** Object-scoped channel browser around the shared curve math/editor. It
 * owns only transient visibility; source keys and command history remain in
 * the private 3D clip. Non-numeric channels stay in the Dope Sheet. */
export function ModelCurveEditor({ model, selection }: { model: ModelClipEditor; selection?: ModelSelection }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const { editor, timeline, context, playback } = model
  const data = model.previewLayer.model3d
  const channels = timeline?.tracks.filter(track => modelTrackBelongsToSelection(track.target, selection) && isScalarNumericTrack(track)) ?? []
  const groups = new Map<string, typeof channels>()
  for (const track of channels) {
    const info = modelTrackPresentation(data, modelPathFromTrack(track.target)!)
    const name = selection ? info.section : `${info.group} · ${info.section}`
    groups.set(name, [...(groups.get(name) ?? []), track])
  }
  const scopeKey = channels.map(track => track.target).join('\n')
  const scope = useMemo(() => new Set(scopeKey ? scopeKey.split('\n').filter(target => !hidden.has(target)) : []), [scopeKey, hidden])
  const name = modelSelectionName(data, selection)
  return <div className="flex h-full min-h-0 bg-[#0b1423] text-slate-200">
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-700/70" aria-label="3D curve channels">
      <div className="shrink-0 border-b border-slate-700/70 bg-[#101b2d] px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider text-slate-400">Animated properties</div>
        <div className="mt-1 truncate font-medium text-cyan-200" title={name ?? '3D scene overview'}>{name ?? '3D scene overview'}</div>
        <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-slate-400"><span>{channels.length} numeric curves</span>
          {hidden.size > 0 && <button type="button" className="text-cyan-200 hover:underline focus-visible:outline-2 focus-visible:outline-cyan-300" onClick={() => setHidden(new Set())}>Show all</button>}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {Array.from(groups, ([group, tracks]) => <div key={group}>
          <div className="border-b border-slate-700/70 bg-[#14243a] px-3 py-1.5 font-medium text-slate-300">{group}</div>
          {tracks.map(track => {
            const info = modelTrackPresentation(data, modelPathFromTrack(track.target)!)
            const visible = !hidden.has(track.target)
            return <button key={track.target} type="button" aria-pressed={visible} aria-label={`${visible ? 'Hide' : 'Show'} ${group} ${info.label} curve`}
              title={`${info.label}${info.unit ? ` · ${info.unit}` : ''} · ${track.keyframes.length} keys`}
              onClick={() => setHidden(current => { const next = new Set(current); next.has(track.target) ? next.delete(track.target) : next.add(track.target); return next })}
              className={`flex h-8 w-full items-center gap-2 border-b border-slate-800 px-4 text-left focus-visible:outline-2 focus-visible:outline-cyan-300 ${visible ? 'bg-[#0e1929] hover:bg-slate-700/50' : 'text-slate-500 hover:bg-slate-800'}`}>
              <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: visible ? info.color : '#64748b' }} />
              <span className="min-w-0 flex-1 truncate">{info.label}</span><span className="text-[10px] text-slate-400">{track.keyframes.length}</span>
            </button>
          })}
        </div>)}
        {!channels.length && <p className="px-3 py-3 text-slate-400">{selection ? 'Set numeric keys on this object to see its curves.' : 'Select an animated 3D object.'}</p>}
      </div>
    </aside>
    <div className="min-w-0 flex-1" role="region" aria-label="3D value curves">
      {channels.length > 0 && scope.size === 0 ? <div className="flex h-full items-center justify-center text-slate-400">All curves are hidden. Choose a channel or Show all.</div>
      : <CurveEditor compact scene={editor.scene} editor={editor} selectedLayerId={model.previewLayer.id} selectedTimelineId={timeline?.id ?? null} context={context}
        trackScope={scope} currentTimeMs={playback.currentTimeMs} onTimeChange={playback.handleSeek}
        selectedKfIds={model.selectedKeys} onSelectKeyframes={model.setSelectedKeys}
        trackPresentation={target => { const info = modelTrackPresentation(data, modelPathFromTrack(target)!)
          return { label: `${selection ? '' : `${info.group} · `}${info.section} · ${info.label}${info.unit ? ` (${info.unit})` : ''}`, color: info.color } }} />}
    </div>
  </div>
}
