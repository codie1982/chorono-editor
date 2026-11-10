'use client'
import { useState, useRef, useCallback, useLayoutEffect } from 'react'
import type { ChronoScene } from '@/lib/types'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import {
  initHistory, pushHistory, undoHistory, redoHistory,
  type HistoryState,
} from '@/lib/editor/history'
import type { CloneMetadata } from '@/lib/clone/CloneTypes'
import { isCloneArrayCommand } from '@/lib/editor/commands-clone'
import { AssetSourceOwner } from '@/lib/asset/sources'
import { executeAuthoredCommand, assertAuthoringData } from '@/lib/editor/authoring'
import { EditorDocumentLifetime } from '@/lib/editor/lifecycle/EditorDocumentLifetime'

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
  getScene: () => ChronoScene
  getRevision: () => number
  /** Runtime identity: resets abort old async work; edits and undo preserve it. */
  getDocumentSignal: () => AbortSignal
  isTransactionActive: () => boolean
  dispatchCommand: (cmd: EditorCommand) => void
  beginTransaction: () => void
  previewTransaction: (scene: ChronoScene) => void
  commitTransaction: (cmd: EditorCommand) => void
  cancelTransaction: (options?: { preserveScene?: boolean }) => void
  undo: () => void
  redo: () => void
  /** Replace the entire scene without history (use sparingly — e.g. Clear). */
  resetScene: (scene: ChronoScene) => void
  /**
   * BL-59 — Editor-level metadata map for Clone & Array System.
   * Keys are layer ids; values describe the clone relationship to the
   * source (mode, arrayGroupId, createdAt). Lives OUTSIDE scene JSON
   * so SDK / file export stays clean.
   */
  layerMetaById: Record<string, CloneMetadata>
  /** Returns all layer ids that share an arrayGroupId with `layerId`. */
  getSiblingsInArray: (layerId: string) => string[]
  /** Clear all clone metadata (e.g. on scene reset). */
  clearLayerMeta: () => void
}

/**
 * Central editor state: history stack + transaction system.
 *
 * All scene mutations MUST go through dispatchCommand() or the transaction
 * helpers — never call setScene directly from a component.
 *
 * Owns original Blob URL leases for present/past/future and the active transaction
 * base. Replacing history acquires new source sets before releasing dropped ones;
 * source handles never enter scene/history JSON. Decoded media has separate owners.
 * Authoring attribution is stamped once on command/gesture commit, stored in
 * the same immutable history snapshot. Preview/cancel/evaluation do not stamp;
 * undo/redo restores the original attribution.
 * Layout setup/cleanup supports StrictMode replay through the pool's deferred
 * final release. Reset discards both history and an in-progress transaction.
 */
export function useEditorState(initialScene: ChronoScene): EditorStateReturn {
  const [history, setHistory] = useState<HistoryState>(() => initHistory(initialScene))
  const txRef = useRef<Transaction | null>(null)
  const historyRef = useRef(history)
  const revisionRef = useRef(0)
  const documentRef = useRef<EditorDocumentLifetime | null>(null)
  if (!documentRef.current) documentRef.current = new EditorDocumentLifetime()
  const sourcesRef = useRef<AssetSourceOwner | null>(null)
  if (!sourcesRef.current) sourcesRef.current = new AssetSourceOwner()
  /** Reconcile retained immutable asset arrays, including an asset-less preview's
   * base. The owner coalesces repeated arrays across history states. */
  const syncSources = useCallback((value: HistoryState) => {
    const scenes = [value.present, ...value.past, ...value.future]
    if (txRef.current) scenes.push(txRef.current.baseScene)
    sourcesRef.current!.update(scenes.map(item => item.assets))
  }, [])
  useLayoutEffect(() => {
    documentRef.current!.start()
    syncSources(historyRef.current); sourcesRef.current!.start()
    return () => { documentRef.current!.stop(); sourcesRef.current!.stop() }
  }, [syncSources])
  /** Apply a synchronous state transition and reconcile source ownership even for
   * no-op transaction setup or a throwing command. A failed command keeps the
   * previous history; any changed transaction ref is still reflected by the owner. */
  const updateHistory = useCallback((update: (prev: HistoryState) => HistoryState) => {
    const prev = historyRef.current
    let next = prev
    try { next = update(prev) } finally { syncSources(next) }
    if (next === prev) return
    historyRef.current = next
    revisionRef.current++
    setHistory(next)
  }, [syncSources])
  const getScene = useCallback(() => historyRef.current.present, [])
  const getRevision = useCallback(() => revisionRef.current, [])
  const getDocumentSignal = useCallback(() => documentRef.current!.signal, [])
  const isTransactionActive = useCallback(() => txRef.current !== null, [])

  // BL-59 — Editor-level clone/array metadata, kept OUTSIDE scene JSON.
  // useState (not ref) so re-renders pick up new entries; mutation goes
  // through setLayerMetaById which preserves immutability for React.
  const [layerMetaById, setLayerMetaById] = useState<Record<string, CloneMetadata>>({})

  const scene   = history.present
  const canUndo = history.past.length > 0
  const canRedo = history.future.length > 0

  // ── Normal command dispatch ────────────────────────────────────────────────
  const dispatchCommand = useCallback((cmd: EditorCommand) => {
    updateHistory((h) => pushHistory(h, executeAuthoredCommand(cmd, h.present)))
    // BL-59 — Clone/Array commands carry per-clone metadata. Merge it
    // into the editor-state map so "Select all instances" works.
    if (isCloneArrayCommand(cmd)) {
      setLayerMetaById((prev) => ({ ...prev, ...cmd.layerMetadata }))
    }
  }, [updateHistory])

  // ── Transaction: used by all drag operations ───────────────────────────────
  const beginTransaction = useCallback(() => {
    updateHistory((h) => {
      txRef.current = { baseScene: h.present }
      return h
    })
  }, [updateHistory])

  const previewTransaction = useCallback((next: ChronoScene) => {
    if (!txRef.current) return
    // Update present directly WITHOUT pushing to past (no history entry yet)
    updateHistory((h) => ({ ...h, present: next }))
  }, [updateHistory])

  const commitTransaction = useCallback((cmd: EditorCommand) => {
    if (!txRef.current) { dispatchCommand(cmd); return }
    const base = txRef.current.baseScene
    txRef.current = null
    updateHistory((h) => pushHistory({ ...h, present: base }, executeAuthoredCommand(cmd, base)))
    // Clone-drag commits carry per-clone metadata — merge it so instance
    // tracking ("Select all instances") works for drag-created clones too.
    if (isCloneArrayCommand(cmd)) {
      setLayerMetaById((prev) => ({ ...prev, ...cmd.layerMetadata }))
    }
  }, [dispatchCommand, updateHistory])

  /** End a gesture. Normal cancellation restores its baseline. A caller that
   * detects an intervening source edit may preserve the current scene instead;
   * abandoning that stale gesture must never restore an older user document. */
  const cancelTransaction = useCallback((options?: { preserveScene?: boolean }) => {
    if (!txRef.current) return
    const base = txRef.current.baseScene
    txRef.current = null
    updateHistory((h) => options?.preserveScene ? h : ({ ...h, present: base }))
  }, [updateHistory])

  // ── Undo / Redo ────────────────────────────────────────────────────────────
  const undo = useCallback(() => updateHistory(undoHistory), [updateHistory])
  const redo = useCallback(() => updateHistory(redoHistory), [updateHistory])

  // ── Hard reset (used by "Clear" — bypasses undo on purpose) ──────────────
  const resetScene = useCallback((next: ChronoScene) => {
    assertAuthoringData(next.authoring)
    documentRef.current!.replace()
    txRef.current = null
    updateHistory(() => initHistory(next))
    setLayerMetaById({})
  }, [updateHistory])

  // ── BL-59 helpers ──────────────────────────────────────────────────────────
  const getSiblingsInArray = useCallback((layerId: string): string[] => {
    const meta = layerMetaById[layerId]
    if (!meta?.arrayGroupId) return [layerId]
    const groupId = meta.arrayGroupId
    return Object.entries(layerMetaById)
      .filter(([, m]) => m.arrayGroupId === groupId)
      .map(([id]) => id)
  }, [layerMetaById])

  const clearLayerMeta = useCallback(() => {
    setLayerMetaById({})
  }, [])

  return {
    scene, canUndo, canRedo, getScene, getRevision, getDocumentSignal, isTransactionActive,
    dispatchCommand,
    beginTransaction, previewTransaction, commitTransaction, cancelTransaction,
    undo, redo, resetScene,
    layerMetaById,
    getSiblingsInArray,
    clearLayerMeta,
  }
}
