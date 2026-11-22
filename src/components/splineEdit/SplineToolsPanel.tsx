'use client'
import { SplineLineDrawingControls } from './SplineAutoCloseControl'
import type { ReactNode } from 'react'
import { BooleanPreviewControls } from '../booleanPreview/BooleanPreviewControls'
import type { BooleanPreviewController } from '../booleanPreview/useBooleanPreview'

/** Dock body for the existing spline inspector and Boolean preview. It owns
 * neither edit mode nor source/history: the page supplies both shared owners.
 * One scroll container keeps long topology/paint controls reachable without
 * increasing the canvas/Timeline footprint. Closing/reopening a dock tab does
 * not reset the page-owned selection or a running preview. */
export function SplineToolsPanel({ booleanPreview, children, lineDrawing, contained = false, showBooleanPreview = true }: {
  booleanPreview: BooleanPreviewController; children?: ReactNode
  /** Shared Edit dock owns the lower geometry pane's scrolling. */
  contained?: boolean
  showBooleanPreview?: boolean
  lineDrawing?: { autoClose: boolean; onAutoClose(value: boolean): void }
}) {
  return <section aria-label="Spline & Boolean tools" className={`h-full min-h-0 bg-gray-900 text-gray-300 ${contained ? 'flex flex-col overflow-hidden' : 'overflow-auto'}`}>
    <div className={contained ? 'max-h-[55%] shrink-0 overflow-auto' : undefined}>
      {lineDrawing && <SplineLineDrawingControls {...lineDrawing} />}
      {showBooleanPreview && <BooleanPreviewControls controller={booleanPreview} />}
    </div>
    <div className={contained ? 'min-h-0 flex-1' : undefined}>
      {children || (!lineDrawing && <p className="p-3 text-xs leading-relaxed text-gray-400">Select a spline to edit Points, Edges or Objects. Select 2–8 closed shapes, splines or spline Objects for Boolean preview.</p>)}
    </div>
  </section>
}
