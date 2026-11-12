'use client'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { ItemDetailSession } from '@/lib/editor/detail'

/** Own one temporary authoring session, never a new workspace mode. Committed
 * source is captured synchronously; resets close the draft, ordinary commits
 * invalidate Apply. Closing restores focus without changing source selection.
 * Cleanup belongs here, outside the dynamically mounted draft editor's StrictMode
 * replay. The browser's document lifetime remains the authoritative reset signal.
 */
export function useItemDetail(editor: EditorStateReturn) {
  const [session, setSession] = useState<ItemDetailSession | null>(null)
  const latest = useRef(editor); latest.current = editor
  const restoreFocus = useRef<HTMLElement | null>(null)
  const open = useCallback((id: string) => {
    const current = latest.current
    if (current.isTransactionActive()) throw new Error('Finish the current pointer gesture first.')
    const next = new ItemDetailSession(current.getCommittedScene(), current.getRevision(), current.getDocumentSignal(), id)
    restoreFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setSession(old => { old?.close(); return next })
  }, [])
  const close = useCallback(() => {
    setSession(old => { old?.close(); return null })
    requestAnimationFrame(() => { if (restoreFocus.current?.isConnected) restoreFocus.current.focus({ preventScroll: true }) })
  }, [])
  useEffect(() => {
    if (!session) return
    session.document.addEventListener('abort', close, { once: true })
    return () => { session.document.removeEventListener('abort', close); session.close() }
  }, [session, close])
  return { session, open, close }
}

/** Keep the main DOM mounted to retain dock state, scrolling and viewport view.
 * Native inert blocks pointer/focus access; previous ownership is restored on
 * cleanup. The main keyboard dispatcher is separately suspended by its owner.
 */
export function useInactiveDetailSurface<T extends HTMLElement>(inactive: boolean) {
  const ref = useRef<T | null>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const previous = element.inert
    element.inert = inactive
    return () => { element.inert = previous }
  }, [inactive])
  return ref
}
