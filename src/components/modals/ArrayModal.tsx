'use client'
import { DocumentationHelp } from '@/components/help/DocumentationHelp'
import { useEffect, useRef } from 'react'
import type { ArrayPattern } from '@/lib/array/ArrayTypes'
import type { ArrayAuthoringController } from '@/components/array/useArrayAuthoring'
import { ArrayPatternFields } from '@/components/array/ArrayPatternFields'
import { ArrayCommonFields } from '@/components/array/ArrayCommonFields'
import { ArrayPreviewSummary } from '@/components/array/ArrayPreviewSummary'

export interface ArrayModalProps { authoring: ArrayAuthoringController }

/** Floating Array controls permit canvas handles and pan/zoom while open.
 * The production authoring adapter owns the pinned source/plan/history; this
 * view owns focus and outside/Escape dismissal only. A failed Apply stays open.
 * Numeric controls are single-pointer/keyboard alternatives to every handle.
 * It is deliberately non-modal because the canvas remains an interactive peer.
 */
export default function ArrayModal({ authoring }: ArrayModalProps) {
  const dialog = useRef<HTMLDivElement>(null)
  const close = useRef(authoring.close); close.current = authoring.close
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current() }
    }
    const outside = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (target && !target.closest('[data-array-controls], [data-array-preview], [data-panel="canvas"]')) close.current()
    }
    document.addEventListener('keydown', keyboard, true)
    document.addEventListener('pointerdown', outside, true)
    return () => { document.removeEventListener('keydown', keyboard, true); document.removeEventListener('pointerdown', outside, true)
      if (previous?.isConnected) previous.focus() }
  }, [])
  const { settings, plan, error } = authoring
  const canApply = !!plan && !error && plan.summary.newOccurrences > 0
  return <div className="pointer-events-none fixed inset-0 z-[75]">
    <div ref={dialog} data-array-controls role="dialog" aria-modal="false" aria-label="Array selection"
      className="pointer-events-auto absolute right-4 top-4 max-h-[calc(100vh-32px)] w-[420px] max-w-[calc(100vw-32px)] overflow-y-auto rounded-lg border border-slate-600 bg-slate-900 p-4 text-slate-100 shadow-2xl"
      onPointerDown={event => event.stopPropagation()}>
      <div className="mb-3 flex items-start justify-between gap-3"><h2 className="text-sm font-semibold">Array {authoring.sourceCount > 1 ? `${authoring.sourceCount} selected sources` : `“${authoring.sourceName}”`}</h2>
        <DocumentationHelp topic="editor/layers/arrays" className="ml-auto" />
        <button type="button" aria-label="Close Array" onClick={authoring.close} className="rounded px-2 py-1 hover:bg-slate-700">×</button></div>
      <div role="group" aria-label="Array pattern" className="mb-3 grid grid-cols-4 gap-1">{(['linear','grid','radial','path'] as const).map(pattern =>
        <button key={pattern} type="button" aria-label={`Array ${pattern[0].toUpperCase()}${pattern.slice(1)}`} aria-pressed={settings.pattern === pattern}
          className={`rounded border px-2 py-2 text-xs ${settings.pattern === pattern ? 'border-blue-400 bg-blue-700 text-white' : 'border-slate-600 bg-slate-800'}`}
          onClick={() => authoring.setPattern(pattern as ArrayPattern)}>{pattern[0].toUpperCase()}{pattern.slice(1)}</button>)}</div>
      <ArrayPatternFields settings={settings} setSettings={authoring.setSettings} paths={authoring.pathLayers} />
      <ArrayCommonFields authoring={authoring} />
      <ArrayPreviewSummary plan={plan} />
      {error && <p role="alert" className="mb-3 rounded border border-rose-700 bg-rose-950/50 p-2 text-xs text-rose-200">{error}</p>}
      {!!plan?.diagnostics.length && <p role="status" className="mb-3 text-xs text-amber-200">{plan.diagnostics.join(' ')}</p>}
      <p className="mb-3 text-xs text-slate-400">Drag the viewport step, spacing or center handles; the same values are editable above. Preview does not change source or history.</p>
      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-700 bg-slate-900 pt-3">
        <button type="button" aria-label="Cancel array" onClick={authoring.close} className="rounded border border-slate-500 px-3 py-2 text-xs">Cancel</button>
        <button type="button" aria-label="Apply array" disabled={!canApply} onClick={authoring.apply}
          className="rounded bg-blue-600 px-3 py-2 text-xs text-white disabled:cursor-not-allowed disabled:opacity-40">Apply Array</button>
      </div>
    </div>
  </div>
}
