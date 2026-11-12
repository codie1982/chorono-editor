'use client'
import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { Layer } from '@/lib/types'
import { canPlaceShape } from '@/lib/editor/placement'
import { ShapePlacementSession } from './ShapePlacementSession'

export interface ShapePlacementOptions {
  template: Layer | null
  active: boolean
  editor: EditorStateReturn
  canvasRef: RefObject<HTMLCanvasElement>
  /** Receives the committed ID, or undefined on cancellation. A successful
   * placement may rearm the same tool with a fresh factory template/ID. */
  onComplete: (id?: string) => void
  onWarning?: (message: string) => void
}

/**
 * Owns the transient UI lifetime of an armed native-shape placement tool.
 * A primary pointer begins one ShapePlacementSession on the persistent canvas.
 * Geometry preview starts only beyond three CSS pixels; pressing alone never
 * flashes the factory-sized object. Final Add is one undo entry.
 * The returned draft is borrowed presentation data, never a second source copy.
 *
 * Escape cancels both an armed tool and an active gesture. Leaving the tool,
 * replacing its template/document or unmounting releases capture and listeners.
 * Document/source conflict handling is shared with other viewport gestures.
 * The parent owns tool/selection state. It may rearm a fresh factory template
 * after a committed ID, or leave placement on cancellation. Selection should
 * change only when that callback receives a committed ID.
 */
export function useShapePlacement(options: ShapePlacementOptions) {
  const latest = useRef(options)
  latest.current = options
  const session = useRef<ShapePlacementSession | null>(null)
  const [draft, setDraft] = useState<Layer | null>(null)
  const documentSignal = options.editor.getDocumentSignal()

  const cancel = useCallback(() => {
    if (session.current) session.current.cancel()
    else { setDraft(null); latest.current.onComplete() }
  }, [])

  useEffect(() => {
    if (!options.active) return
    const escape = (event: KeyboardEvent) => {
      // An active session owns Escape and invokes onComplete when it closes.
      if (event.key === 'Escape' && !session.current) { event.preventDefault(); cancel() }
    }
    const abort = () => cancel()
    window.addEventListener('keydown', escape)
    documentSignal.addEventListener('abort', abort, { once: true })
    return () => {
      window.removeEventListener('keydown', escape)
      documentSignal.removeEventListener('abort', abort)
      session.current?.cancel()
    }
  }, [options.active, options.template, documentSignal, cancel])

  const begin = useCallback((event: PointerEvent<Element>): boolean => {
    const current = latest.current
    const canvas = current.canvasRef.current
    if (!current.active || !current.template || !canPlaceShape(current.template) || !canvas
        || event.button !== 0 || event.isPrimary === false || session.current
        || current.editor.isTransactionActive()) return false
    event.preventDefault()
    event.stopPropagation()
    current.editor.beginTransaction()
    try {
      const next = new ShapePlacementSession({
        getEditor: () => latest.current.editor, canvas, template: current.template, start: event, eventTarget: window,
        onDraft: setDraft,
        onClose: id => { session.current = null; setDraft(null); latest.current.onComplete(id) },
        onWarning: message => latest.current.onWarning?.(message),
      })
      session.current = next
    } catch (error) {
      current.editor.cancelTransaction()
      setDraft(null)
      current.onWarning?.(error instanceof Error ? error.message : String(error))
      current.onComplete()
    }
    return true
  }, [])

  return { begin, draft, cancel }
}
