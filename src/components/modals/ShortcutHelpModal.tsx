'use client'
import { useRef } from 'react'
import { useNativeModal } from '../ui/useNativeModal'
import KeyboardShortcutsPanel from '../panels/KeyboardShortcutsPanel'

/** File → Keyboard Shortcuts and Cmd+/ share the live shortcut registry view.
 * Native modal focus containment/inert background and Escape dismissal replace
 * the old hard-coded duplicate list. Nothing writes source/history. Unmount
 * closes the dialog; the invoking control regains focus through native dialog
 * ownership. The scrollable content preserves search and 2D/3D categories. */
export default function ShortcutHelpModal({ onClose }: { onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useNativeModal(ref, '[aria-label="Close keyboard shortcuts"]')
  return <dialog ref={ref} aria-label="Keyboard Shortcuts" onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose() }}
    onKeyDown={event => event.stopPropagation()}
    className="fixed inset-0 m-auto h-[min(46rem,90dvh)] w-[min(64rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-gray-700 bg-gray-900 p-0 text-gray-200 shadow-2xl backdrop:bg-black/60">
    <div className="flex h-full min-h-0 flex-col"><header className="flex shrink-0 items-center justify-between border-b border-gray-700 px-4 py-3">
      <h2 className="text-sm font-semibold">Keyboard Shortcuts</h2><button type="button" aria-label="Close keyboard shortcuts" onClick={onClose}
        className="rounded px-2 py-1 hover:bg-gray-700 focus-visible:outline focus-visible:outline-blue-400">✕</button></header>
      <div className="min-h-0 flex-1"><KeyboardShortcutsPanel /></div>
    </div>
  </dialog>
}
