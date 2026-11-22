'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { ItemDetailSession } from '@/lib/editor/detail'
import styles from './ItemDetailWorkspace.module.css'

export const DRAFT_HISTORY = Object.freeze({ maxSteps: 20, maxBytes: 16 * 1024 ** 2, maxNodes: 100000 })
export const detailButton = 'rounded border border-gray-600 bg-gray-700 px-3 py-1.5 text-xs text-gray-100 hover:bg-gray-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 disabled:opacity-50'
const button = detailButton

/** Common detail lifetime and focus boundary. A scoped editor supplies the
 * draft; this shell owns Back/Cancel confirmation and the single atomic main
 * commit. No source history or camera state leaks across editor contexts.
 */
export function DetailWorkspaceShell({ session, main, draft, dirty, draftError, clipMode = false, focus: controlledFocus, onFocusChange, onEscape, onClose, children }: {
  session: ItemDetailSession; main: EditorStateReturn; draft: EditorStateReturn; dirty: boolean;
  draftError?: string | null; clipMode?: boolean; focus?: boolean; onFocusChange?(focused: boolean): void;
  /** Return true after consuming Escape for a nested view-only mode. */
  onEscape?(): boolean; onClose(): void; children: ReactNode
}) {
  const [error, setError] = useState<string | null>(null), [confirmExit, setConfirmExit] = useState(false), [localFocus, setLocalFocus] = useState(false)
  const focus = controlledFocus ?? localFocus
  const backRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { backRef.current?.focus({ preventScroll: true }) }, [])
  const stale = main.getRevision() !== session.revision || main.getDocumentSignal() !== session.document || session.document.aborted
  /** Atomic source commit with synchronous revision/document/gesture checks. */
  const apply = () => {
    try {
      if (draft.isTransactionActive()) throw new Error('Finish the current detail pointer gesture first.')
      session.assertCurrent(main.getRevision(), main.getDocumentSignal(), main.isTransactionActive())
      const command = (clipMode ? session.prepareClipApply.bind(session) : session.prepareApply.bind(session))(draft.getCommittedScene(), main.getCommittedScene(), main.getRevision(), main.getDocumentSignal())
      if (command) main.dispatchCommand(command)
      onClose()
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
  }
  /** A click may follow a numeric input's blur commit before this render's dirty
   * value updates. Read the synchronous committed source before deciding exit. */
  const requestExit = () => {
    if (draft.isTransactionActive()) { setError('Finish or cancel the current gesture first.'); return }
    const committed = draft.getCommittedScene(), owner = committed.layers.find(layer => layer.id === session.layer.id)!
    const changed = clipMode ? JSON.stringify(session.animation!.model(committed)) !== JSON.stringify(session.layer.model3d)
      : session.adapter.fields.some(key => JSON.stringify(owner[key]) !== JSON.stringify(session.layer[key]))
    changed ? setConfirmExit(true) : onClose()
  }
  return <section aria-label="Item detail editor" data-panel="itemDetail" className={`${styles.workspace} ${focus ? styles.focus : ''}`}
    onKeyDown={event => {
      // Detail owns source shortcuts while main dispatch is suspended. Native
      // text inputs retain their browser Undo. Escape never discards a draft.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName)) {
        event.preventDefault(); event.stopPropagation()
        if (!draft.isTransactionActive()) event.shiftKey ? draft.redo() : draft.undo()
      }
      if (event.key === 'Escape' && !event.defaultPrevented && !(event.target as HTMLElement).closest('[role="menu"], [role="dialog"]')) {
        if (draft.isTransactionActive()) return
        event.preventDefault(); onEscape?.() || (confirmExit ? setConfirmExit(false) : requestExit())
      }
      if (!draft.isTransactionActive()) event.stopPropagation()
    }}>
    <header className={styles.header}>
      <button ref={backRef} type="button" className={button} onClick={requestExit}>← Back</button>
      <nav className={styles.crumbs} aria-label="Detail breadcrumb">
        <button type="button" className={button} onClick={requestExit}>Scene</button><span aria-hidden="true">›</span>
        <span aria-current="page" className={styles.name}>{session.layer.name}</span>
      </nav>
      <div className={styles.actions}>
        <span className="text-xs text-gray-300" role="status">{dirty ? 'Unsaved detail' : session.adapter.label}</span>
        <button type="button" className={button} disabled={!draft.canUndo || draft.isTransactionActive()} onClick={draft.undo}>Undo</button>
        <button type="button" className={button} disabled={!draft.canRedo || draft.isTransactionActive()} onClick={draft.redo}>Redo</button>
        <button type="button" className={button} aria-pressed={focus} onClick={() => onFocusChange ? onFocusChange(!focus) : setLocalFocus(!focus)}>Focus view</button>
        <button type="button" className={button} onClick={requestExit}>Cancel</button>
        <button type="button" className={`${button} !bg-sky-700`} disabled={stale || draft.isTransactionActive()} onClick={apply}>Apply &amp; return</button>
      </div>
    </header>
    {confirmExit && <div role="group" aria-label="Unsaved detail changes" className={styles.decision}>
      <span className="text-sm">Keep your detail changes?</span>
      <button type="button" className={button} disabled={stale} onClick={apply}>Apply &amp; return</button>
      <button type="button" className={button} onClick={onClose}>Discard &amp; return</button>
      <button type="button" className={button} onClick={() => { setConfirmExit(false); backRef.current?.focus() }}>Stay</button>
    </div>}
    {stale && <div role="alert" className={styles.notice}>The scene changed while this detail was open. Cancel and reopen it before applying; newer edits are preserved.</div>}
    {(error || draftError) && <div role="alert" className={styles.notice}>{error || draftError}</div>}
    {children}
    <footer className={styles.footer}><span>Draft only · Apply creates one main Undo step</span>
      <span>{clipMode ? 'Private content Timeline · outer keys remain in the scene' : 'Static content controls · existing keys are preserved'}</span>
      <span>History: up to 20 steps / 16 MiB policy · {draft.historyBudget.retainedSteps} retained</span></footer>
  </section>
}
