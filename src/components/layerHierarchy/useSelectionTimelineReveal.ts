'use client'
import { useEffect, useLayoutEffect, useRef } from 'react'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'

/** Synchronize selection with the existing Timeline find operation, after the
 * selecting pointer gesture has ended. Opening a dock during a canvas drag can
 * change its coordinate frame, so neither scrolling nor dock restoration runs
 * while a pointer or source transaction is active. Requests coalesce to the
 * latest selection; commits wake pending requests without idle polling.
 *
 * Owns document listeners and at most one animation-frame callback. Document
 * replacement, disabled detail/preview contexts and unmount discard pending
 * work. This adapter never authors tracks, keys, selection or history.
 */
export function useSelectionTimelineReveal(options: {
  selectedId: string | null; selectedIds: ReadonlySet<string>; timelineId: string | null
  documentSignal: AbortSignal; enabled: boolean; onReveal: () => void
  editor: Pick<EditorStateReturn, 'isTransactionActive' | 'subscribeCommitted'>
}) {
  const latest = useRef(options); latest.current = options
  const pending = useRef(false), pointers = useRef(new Set<number>())
  const frame = useRef<number | null>(null)
  const wake = useRef(() => {})
  // IDs, not Set identity or evaluated frames, define a new selection.
  const selectionKey = JSON.stringify([options.selectedId, Array.from(options.selectedIds).sort()])

  useLayoutEffect(() => {
    const signal = options.documentSignal
    const clear = () => {
      pending.current = false
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      frame.current = null
    }
    const schedule = () => {
      if (!pending.current || frame.current !== null || pointers.current.size || signal.aborted) return
      frame.current = requestAnimationFrame(() => {
        frame.current = null
        const current = latest.current
        if (!pending.current || pointers.current.size || signal.aborted || !current.enabled || current.editor.isTransactionActive()) return
        pending.current = false
        current.onReveal()
      })
    }
    wake.current = schedule
    const down = (event: PointerEvent) => { pointers.current.add(event.pointerId) }
    const up = (event: PointerEvent) => { pointers.current.delete(event.pointerId); schedule() }
    const end = () => { pointers.current.clear(); schedule() }
    document.addEventListener('pointerdown', down, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', up, true)
    window.addEventListener('blur', end)
    window.addEventListener('dragend', end)
    signal.addEventListener('abort', clear)
    const unsubscribe = options.editor.subscribeCommitted(schedule)
    return () => {
      clear(); pointers.current.clear(); unsubscribe()
      document.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', up, true)
      window.removeEventListener('blur', end)
      window.removeEventListener('dragend', end)
      signal.removeEventListener('abort', clear)
    }
  }, [options.documentSignal, options.editor.subscribeCommitted])

  useEffect(() => {
    pending.current = options.enabled && !!options.timelineId && (!!options.selectedId || options.selectedIds.size > 0)
    wake.current()
  }, [selectionKey, options.timelineId, options.documentSignal, options.enabled])
}
