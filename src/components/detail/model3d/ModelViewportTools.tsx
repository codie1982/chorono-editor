'use client'
import type { ReactNode } from 'react'
import { MODEL_VIEWPORT_TOOLS, type ModelViewportTool } from '@/lib/model3d/inspection/viewportTools'

/** Compact, keyboard-accessible counterpart of the 2D Select/transform/Pan
 * group. These are view-local modes, independent of scene history and the
 * Polygon/Spline modeling mode. */
export function ModelViewportTools({ tool, onChange, children }: { tool: ModelViewportTool; onChange(tool: ModelViewportTool): void; children?: ReactNode }) {
  return <div role="toolbar" aria-label="3D viewport tools" className="flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto border-b border-gray-700 bg-gray-900 px-2 py-1.5">
    {MODEL_VIEWPORT_TOOLS.map((item, index) => <button key={item.id} type="button" aria-pressed={tool === item.id}
      aria-label={item.label} title={`${item.label} · ${item.key}`} onClick={() => onChange(item.id)}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded border focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 ${index === 4 ? 'ml-2 ' : ''}${tool === item.id ? 'border-sky-500 bg-sky-800 text-white' : 'border-gray-700 bg-gray-800 text-slate-300 hover:bg-gray-700'}`}>
      <ModelToolIcon kind={item.id} />
    </button>)}
    {children}
  </div>
}

/** Stroke glyphs inherit the dark toolbar's active and hover colors. */
function ModelToolIcon({ kind }: { kind: ModelViewportTool }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" {...common}>
    {kind === 'select' ? <path d="M4 2v15l4-4 3.5 5 2-1.3-3.4-5L16 10 4 2Z" />
      : kind === 'move' ? <><path d="M10 2v16M2 10h16M10 2 7.5 5M10 2l2.5 3M10 18l-2.5-3M10 18l2.5-3M2 10l3-2.5M2 10l3 2.5M18 10l-3-2.5M18 10l-3 2.5" /></>
      : kind === 'rotate' ? <><path d="M16.5 7A7 7 0 1 0 17 12M16.5 7V2.5M16.5 7H12" /></>
      : kind === 'scale' ? <><path d="M4 16 16 4M10 4h6v6M4 10v6h6" /></>
      : kind === 'pan' ? <><path d="M5.5 17V8a1.5 1.5 0 0 1 3 0V5a1.5 1.5 0 0 1 3 0v3a1.5 1.5 0 0 1 3 0v2a1.5 1.5 0 0 1 2.5 1v3c0 2.2-1.7 4-4 4H9c-1.3 0-2.6-.4-3.5-1Z" /></>
      : <><circle cx="10" cy="10" r="3" /><path d="M2.5 10a7.5 7.5 0 0 1 13-5M17.5 10a7.5 7.5 0 0 1-13 5M15.5 5V1.8M15.5 5h-3M4.5 15v3.2M4.5 15h3" /></>}
  </svg>
}
