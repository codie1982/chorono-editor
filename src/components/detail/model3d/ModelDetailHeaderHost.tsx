'use client'
import type { ReactNode } from 'react'

/** Replaces the main 2D tool strip while a model detail editor owns input.
 * Workspace navigation is portaled into this slot by the scoped 3D editor. */
export function ModelDetailHeaderHost({ name, fileMenu }: { name: string; fileMenu?: ReactNode }) {
  return <header data-testid="model-editor-toolbar" className="flex min-w-0 min-h-12 shrink-0 items-center gap-3 border-b border-[#263244] bg-[#0b1220] px-3 text-slate-200">
    {fileMenu}
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="#67e8f9" strokeWidth="1.4" strokeLinejoin="round">
      <path d="M10 1.5 18 6v8l-8 4.5L2 14V6l8-4.5ZM2 6l8 4.5L18 6M10 10.5v8" />
    </svg>
    <span className="text-xs font-semibold uppercase tracking-wide text-cyan-200">3D</span>
    <span className="hidden max-w-44 truncate text-xs text-slate-400 lg:block" title={name}>{name}</span>
    <div className="h-6 w-px shrink-0 bg-[#334155]" aria-hidden="true" />
    <div id="model-detail-toolbar" className="flex min-w-0 flex-1 items-center overflow-x-auto" />
  </header>
}
