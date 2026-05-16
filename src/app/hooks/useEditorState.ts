'use client'
import { useState, useRef, useCallback } from 'react'
import type { ChronoScene } from '@/lib/types'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import {
  initHistory, pushHistory, undoHistory, redoHistory,
  type HistoryState,
} from '@/lib/editor/history'

// ── Transaction ref ────────────────────────────────────────────────────────────
// A transaction lets a drag op preview many intermediate scenes without each
// one becoming its own undo step. On commit, only the final command is pushed.

interface Transaction {
  /** Snapshot taken at beginTransaction() — restored by cancelTransaction() */
  baseScene: ChronoScene
}

export interface EditorStateReturn {
  scene: ChronoScene
  canUndo: boolean
  canRedo: boolean
  dispatchCommand: (cmd: EditorCommand) => void
  beginTransaction: () => void
  previewTransaction: (scene: ChronoScene) => void
  commitTransaction: (cmd: EditorCommand) => void
  cancelTransaction: () => void
  undo: () => void
  redo: () => void
  /** Replace the entire scene without history (use sparingly — e.g. Clear). */
  resetScene: (scene: ChronoScene) => void
}

/**
 * Central editor state: history stack + transaction system.
 *
 * All scene mutations MUST go through dispatchCommand() or the transaction
 * helpers — never call setScene directly from a component.
 */
export function useEditorState(initialScene: ChronoScene): EditorStateReturn {
  const [history, setHistory] = useState<HistoryState>(() => initHistory(initialScene))
  const txRef = useRef<Transaction | null>(null)

  const scene   = history.present
  const canUndo = history.past.length > 0
  const canRedo = history.future.length > 0

  // ── Normal command dispatch ────────────────────────────────────────────────
  const dispatchCommand = useCallback((cmd: EditorCommand) => {
    setHistory((h) => pushHistory(h, cmd.execute(h.present)))
  }, [])

  // ── Transaction: used by all drag operations ───────────────────────────────
  const beginTransaction = useCallback(() => {
    setHistory((h) => {
      txRef.current = { baseScene: h.present }
      return h
    })
  }, [])

  const previewTransaction = useCallback((next: ChronoScene) => {
    if (!txRef.current) return
    // Update present directly WITHOUT pushing to past (no history entry yet)
    setHistory((h) => ({ ...h, present: next }))
  }, [])

  const commitTransaction = useCallback((cmd: EditorCommand) => {
    if (!txRef.current) { dispatchCommand(cmd); return }
    const base = txRef.current.baseScene
    txRef.current = null
    setHistory((h) => pushHistory({ ...h, present: base }, cmd.execute(base)))
  }, [dispatchCommand])

  const cancelTransaction = useCallback(() => {
    if (!txRef.current) return
    const base = txRef.current.baseScene
    txRef.current = null
    setHistory((h) => ({ ...h, present: base }))
  }, [])

  // ── Undo / Redo ────────────────────────────────────────────────────────────
  const undo = useCallback(() => setHistory(undoHistory), [])
  const redo = useCallback(() => setHistory(redoHistory), [])

  // ── Hard reset (used by "Clear" — bypasses undo on purpose) ──────────────
  const resetScene = useCallback((next: ChronoScene) => {
    setHistory(initHistory(next))
  }, [])

  return {
    scene, canUndo, canRedo,
    dispatchCommand,
    beginTransaction, previewTransaction, commitTransaction, cancelTransaction,
    undo, redo, resetScene,
  }
}
