'use client'
import type { SelectionContainMode } from '@/lib/selection/canvasShapes'
import type { SelectionRegion, SelectionRegionStyle } from '@/lib/selection/selectionGesture'

export type ModelSelectionStyle = Extract<SelectionRegionStyle, 'box' | 'circle' | 'lasso'>

/** View-local counterpart of the 2D region controls. Native buttons keep
 * shape and containment options available to keyboard and pointer users. */
export function ModelSelectionControls({ style, onStyle, containment, onContainment }: {
  style: ModelSelectionStyle; onStyle(style: ModelSelectionStyle): void;
  containment: SelectionContainMode; onContainment(mode: SelectionContainMode): void
}) {
  const button = (active: boolean) => `flex h-8 w-8 items-center justify-center rounded border focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 ${active ? 'border-sky-500 bg-sky-800 text-white' : 'border-gray-700 bg-gray-800 text-slate-300 hover:bg-gray-700'}`
  return <div role="group" aria-label="3D selection region" className="ml-2 flex shrink-0 flex-nowrap items-center gap-1 border-l border-slate-600 pl-2">
    {([['box', 'Square'], ['circle', 'Circle'], ['lasso', 'Freehand']] as const).map(([id, label]) =>
      <button key={id} type="button" className={button(style === id)} aria-label={label} title={label} aria-pressed={style === id} onClick={() => onStyle(id)}><SelectionIcon kind={id} /></button>)}
    <span aria-hidden="true" className="mx-2 h-5 border-l border-slate-600" />
    {([['inside', 'Inside'], ['touching', 'Touching']] as const).map(([id, label]) =>
      <button key={id} type="button" className={button(containment === id)} aria-label={label} title={label} aria-pressed={containment === id} onClick={() => onContainment(id)}><SelectionIcon kind={id} /></button>)}
  </div>
}

/** Region and containment shapes remain readable at toolbar size. */
function SelectionIcon({ kind }: { kind: ModelSelectionStyle | SelectionContainMode }) {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
    {kind === 'box' ? <rect x="3" y="3" width="14" height="14" strokeDasharray="2 2" />
      : kind === 'circle' ? <circle cx="10" cy="10" r="7" strokeDasharray="2 2" />
      : kind === 'lasso' ? <path d="M4 13c-3-6 5-12 10-8 5 3 2 9-3 10-3 1-3 3 0 3" strokeDasharray="2 2" />
      : kind === 'inside' ? <><rect x="2" y="2" width="16" height="16" strokeDasharray="2 2" /><circle cx="10" cy="10" r="3" fill="currentColor" stroke="none" /></>
      : <><rect x="3" y="3" width="14" height="14" strokeDasharray="2 2" /><circle cx="15" cy="15" r="3" fill="currentColor" stroke="none" /></>}
  </svg>
}

/** Pointer-transparent CSS-pixel preview of the shared 2D region gesture. */
export function ModelSelectionRegion({ region, width, height }: { region: SelectionRegion | null; width: number; height: number }) {
  if (!region) return null
  return <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${width} ${height}`}>
    {region.kind === 'box' && <rect x={region.x} y={region.y} width={region.w} height={region.h} fill="#38bdf833" stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="5 3" />}
    {region.kind === 'circle' && <circle cx={region.cx} cy={region.cy} r={region.r} fill="#38bdf833" stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="5 3" />}
    {region.kind === 'lasso' && <polygon points={region.points.map(point => `${point.x},${point.y}`).join(' ')} fill="#38bdf833" stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="5 3" />}
  </svg>
}
