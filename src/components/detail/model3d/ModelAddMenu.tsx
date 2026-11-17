'use client'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { PrimitiveKind } from '@/lib/model3d/modeling/poly/primitiveSource'

const kinds: readonly PrimitiveKind[] = ['box', 'sphere', 'cylinder', 'cone', 'plane']
export interface ModelAddAsset { id: string; name: string; ready: boolean }

/** Vertical viewport Add menu. Polygon, Camera and Light subtype menus open
 * beside their rows; activation creates and selects a source object. The
 * disabled spline row records the future modeling path. Hold timers are
 * instance-local and released on unmount. */
export function ModelAddMenu({ assets, candidate, onCandidate, canAddPrimitive, canAddModel, canAddSceneObject, viewportWidth, onAddPrimitive, onAddModel, onAddCamera, onAddLight }: {
  assets: readonly ModelAddAsset[]; canAddPrimitive: boolean; canAddModel: boolean; canAddSceneObject: boolean; viewportWidth: number
  candidate: string; onCandidate(id: string): void
  onAddPrimitive(kind: PrimitiveKind): void; onAddModel(assetId: string): void
  onAddCamera(projection: 'perspective' | 'orthographic'): void
  onAddLight(kind: 'directional' | 'point' | 'spot'): void
}) {
  const [expanded, setExpanded] = useState(false)
  const [flyout, setFlyout] = useState<'camera' | 'light' | null>(null)
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null), suppressClick = useRef(false)
  useEffect(() => () => { if (hold.current) clearTimeout(hold.current) }, [])
  const cancelHold = () => { if (hold.current) clearTimeout(hold.current); hold.current = null }
  const beginHold = (event: PointerEvent) => {
    if (event.button !== 0 || !canAddPrimitive) return
    cancelHold(); suppressClick.current = false
    hold.current = setTimeout(() => { expanded || setExpanded(true); suppressClick.current = true; hold.current = null }, 450)
  }
  const add = (kind: PrimitiveKind) => { cancelHold(); onAddPrimitive(kind) }
  const chosenAsset = assets.find(asset => asset.id === candidate)
  return <section aria-label="Add 3D object" className="absolute left-10 top-0 z-30 w-48 rounded border border-slate-600 bg-[#111827] p-2 text-xs text-slate-100 shadow-2xl">
    <h2 className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-cyan-300">Add object</h2>
    <div className="relative" onPointerLeave={() => { cancelHold(); setExpanded(false) }}>
      <button type="button" aria-label="Add Box; hover or hold for polygon shapes" title="Add Box · hover or hold for more shapes"
        aria-expanded={expanded} aria-haspopup="true" disabled={!canAddPrimitive}
        onPointerEnter={event => { if (event.pointerType === 'mouse') setExpanded(true) }}
        onPointerDown={beginHold} onPointerUp={cancelHold} onPointerCancel={cancelHold}
        onKeyDown={event => { if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); setExpanded(true) } }}
        onClick={() => { if (suppressClick.current) { suppressClick.current = false; return } add('box') }}
        className="flex h-9 w-full items-center gap-2 rounded border border-slate-600 bg-slate-800 px-2 text-left hover:border-cyan-500 hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-40">
        <PrimitiveIcon kind="box" /><span className="min-w-0 flex-1 truncate">Polygon / Primitive</span><span aria-hidden="true" className="text-slate-400">›</span>
      </button>
      {expanded && <div role="group" aria-label="Polygon primitive shapes"
        className={`absolute z-40 flex w-max max-w-[min(12rem,calc(100vw-2rem))] items-center gap-1 overflow-x-auto rounded border border-slate-600 bg-[#172235] p-1 shadow-2xl ${viewportWidth < 440 ? 'left-0 top-full' : 'left-full top-0'}`}>
        {kinds.map(kind => <button key={kind} type="button" aria-label={`Add ${kind}`} title={`Add ${kind}`}
          disabled={!canAddPrimitive} onClick={() => add(kind)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-slate-600 bg-slate-800 text-slate-100 hover:border-cyan-400 hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-40">
          <PrimitiveIcon kind={kind} />
        </button>)}
      </div>}
    </div>
    <button type="button" disabled aria-label="Spline extrusion unavailable" title="Spline extrusion will be added later"
      className="mt-1 flex h-9 w-full items-center gap-2 rounded border border-slate-700 bg-slate-900 px-2 text-left text-slate-500">
      <SplineIcon /><span>Spline Extrusion</span>
    </button>
    <div className="mt-2 border-t border-slate-700 pt-2 space-y-1">
      {(['camera', 'light'] as const).map(kind => <div key={kind} className="relative"
        onPointerEnter={event => { if (event.pointerType === 'mouse') setFlyout(kind) }} onPointerLeave={() => setFlyout(null)}>
        <button type="button" disabled={!canAddSceneObject} aria-label={`Add ${kind}`} aria-haspopup="true" aria-expanded={flyout === kind}
          onClick={() => setFlyout(kind)}
          onKeyDown={event => { if (event.key === 'ArrowRight') { event.preventDefault(); setFlyout(kind) } }}
          className="flex h-9 w-full items-center gap-2 rounded border border-slate-600 bg-slate-800 px-2 text-left hover:border-cyan-500 hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-40">
          {kind === 'camera' ? <CameraIcon /> : <LightIcon />}<span className="flex-1 capitalize">{kind}</span><span aria-hidden="true">›</span>
        </button>
        {flyout === kind && <div role="group" aria-label={`${kind} types`}
          className={`absolute z-40 min-w-36 rounded border border-slate-600 bg-[#172235] p-1 shadow-2xl ${viewportWidth < 440 ? 'left-0 top-full' : 'left-full top-0'}`}>
          {(kind === 'camera' ? ['perspective', 'orthographic'] as const : ['directional', 'point', 'spot'] as const).map(option =>
            <button key={option} type="button" disabled={!canAddSceneObject} onClick={() => kind === 'camera'
              ? onAddCamera(option as 'perspective' | 'orthographic') : onAddLight(option as 'directional' | 'point' | 'spot')}
              className="block w-full rounded px-2 py-1.5 text-left capitalize hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-40">{option}</button>)}
        </div>}
      </div>)}
    </div>
    <div className="mt-2 border-t border-slate-700 pt-2">
      <label className="block text-[11px] text-slate-400" htmlFor="model3d-add-import">Imported model</label>
      <div className="mt-1 flex gap-1">
        <select id="model3d-add-import" aria-label="Imported model to add" value={candidate} onChange={event => onCandidate(event.target.value)}
          className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-800 px-1 text-xs text-slate-100 focus-visible:outline-2 focus-visible:outline-cyan-300">
          <option value="">Choose asset</option>{assets.map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
        </select>
        <button type="button" aria-label="Add imported model" title="Add imported model" disabled={!canAddModel || !chosenAsset?.ready}
          onClick={() => onAddModel(candidate)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-40"><ImportedModelIcon /></button>
      </div>
    </div>
  </section>
}

/** Common dark-toolbar primitive glyphs avoid a second visual language in Add. */
function PrimitiveIcon({ kind }: { kind: PrimitiveKind }) {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round">
    {kind === 'box' ? <><path d="m10 2 7 4v8l-7 4-7-4V6l7-4Z" /><path d="m3 6 7 4 7-4M10 10v8" /></>
      : kind === 'sphere' ? <><circle cx="10" cy="10" r="8" /><ellipse cx="10" cy="10" rx="3.5" ry="8" /><path d="M2 10h16" /></>
      : kind === 'cylinder' ? <><ellipse cx="10" cy="4.5" rx="7" ry="2.5" /><path d="M3 4.5v10c0 3.3 14 3.3 14 0v-10M3 14.5c0 3.3 14 3.3 14 0" /></>
      : kind === 'cone' ? <><path d="M10 2 3 15c0 3.4 14 3.4 14 0L10 2Z" /><path d="M3 15c0 3.4 14 3.4 14 0" /></>
      : <><path d="m2 7 12-4 4 10-12 4L2 7Z" /><path d="m2 7 4 10M14 3l4 10" /></>}
  </svg>
}
function SplineIcon() {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M3 15c5-15 7 8 14-10" /><circle cx="3" cy="15" r="1.5" /><circle cx="17" cy="5" r="1.5" /></svg>
}
function CameraIcon() {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"><path d="M2 5h11v10H2zM13 8l5-3v10l-5-3" /><circle cx="7.5" cy="10" r="2" /></svg>
}
function LightIcon() {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="10" cy="8" r="4" /><path d="M7 13h6M8 16h4M10 1v2M2 8h2M16 8h2M4 2l2 2M14 4l2-2" /></svg>
}

/** Wireframe cube and inward arrow identify an imported model asset. */
function ImportedModelIcon() {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="m2 7 6-3 6 3v7l-6 3-6-3V7Zm0 0 6 3 6-3M8 10v7" />
    <path d="M17 2v9m-2.5-2.5L17 11l2.5-2.5" stroke="#67e8f9" />
  </svg>
}
