'use client'
import type { ReactNode } from 'react'

/** One native, keyboard-accessible disclosure for secondary Timeline actions.
 * Starts collapsed to preserve track height; expanded controls retain their
 * original state, command owners and disabled/selection rules. No source or
 * persisted editor setting changes when opening or closing this UI.
 */
export function TimelineTools({ selectedLayers, selectedKeys, revealed, children }: {
  selectedLayers: number; selectedKeys: number; revealed: boolean; children: ReactNode
}) {
  return <details className="shrink-0 border-b border-gray-700 bg-gray-900" data-timeline-tools>
    <summary className="cursor-pointer select-none px-3 py-1 text-[11px] text-gray-200 hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400">
      <span className="font-medium">Tools</span>
      <span className="ml-3 text-gray-400">{selectedLayers} {selectedLayers === 1 ? 'layer' : 'layers'} · {selectedKeys} {selectedKeys === 1 ? 'key' : 'keys'} selected{revealed ? ' · Revealed selection' : ''}</span>
    </summary>
    <div role="group" aria-label="Timeline tools" className="max-h-[30vh] overflow-auto border-t border-gray-700">
      {children}
    </div>
  </details>
}
