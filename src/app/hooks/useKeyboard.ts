'use client'
import { useEffect } from 'react'
import type { ToolMode } from '@/components/TopToolbar/ToolGroup'

interface Handlers {
  onUndo: () => void
  onRedo: () => void
  onPlayToggle: () => void
  onStepBack: (frames: number) => void
  onStepForward: (frames: number) => void
  onDeleteSelected: () => void
  onDuplicateSelected: () => void
  onCopy?: () => void
  onPaste?: () => void
  onShowHelp?: () => void
  onGroupSelected?: () => void
  onUngroupSelected?: () => void
  /** BL-59 — Quick Clone with animation copy (Cmd/Ctrl + Alt + D). */
  onCloneQuick?: () => void
  /** BL-59 — Open Array dialog (Cmd/Ctrl + Shift + A). */
  onOpenArrayModal?: () => void
  /** Single-key tool shortcuts (V/H/P/G/R/S/A). No-op if absent. */
  onToolChange?: (mode: ToolMode) => void
  frameRate?: number
}

/**
 * Global keyboard shortcuts for the editor.
 * Attach to document once in the root component.
 */
export function useKeyboard(handlers: Handlers) {
  const {
    onUndo, onRedo, onPlayToggle,
    onStepBack, onStepForward,
    onDeleteSelected, onDuplicateSelected,
    onCopy, onPaste, onShowHelp,
    onGroupSelected, onUngroupSelected,
    onCloneQuick, onOpenArrayModal,
    onToolChange,
    frameRate: _frameRate = 60,
  } = handlers

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      // Skip when user is typing in an input/textarea
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      const meta = e.metaKey || e.ctrlKey

      // ── Undo / Redo ────────────────────────────────────────────────────
      if (meta && e.key === 'z' && !e.shiftKey) { e.preventDefault(); onUndo(); return }
      if (meta && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); onRedo(); return }

      // ── Playback ───────────────────────────────────────────────────────
      if (e.key === ' ') { e.preventDefault(); onPlayToggle(); return }

      // ── Frame stepping ─────────────────────────────────────────────────
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        onStepBack(e.shiftKey ? 10 : 1)
        return
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        onStepForward(e.shiftKey ? 10 : 1)
        return
      }

      // ── Layer operations ───────────────────────────────────────────────
      if ((e.key === 'Delete' || e.key === 'Backspace') && !meta) {
        e.preventDefault(); onDeleteSelected(); return
      }
      // BL-59 — Cmd/Ctrl + Alt + D = "Clone Quick" (richer than Duplicate:
      // also copies animation tracks, atomic undo). Checked BEFORE the plain
      // Cmd+D handler below so the altKey-modified variant wins.
      if (meta && e.altKey && (e.key === 'd' || e.key === 'D' || e.key === '∂') && onCloneQuick) {
        e.preventDefault(); onCloneQuick(); return
      }
      if (meta && e.key === 'd' && !e.altKey) {
        e.preventDefault(); onDuplicateSelected(); return
      }

      // BL-59 — Cmd/Ctrl + Shift + A = open Array dialog.
      // (Single-key A is the "anchor" tool shortcut — handled later in the
      // tool-shortcut block; we skip it when a modifier is held.)
      if (meta && e.shiftKey && (e.key === 'a' || e.key === 'A') && onOpenArrayModal) {
        e.preventDefault(); onOpenArrayModal(); return
      }

      // ── Copy / Paste keyframes ─────────────────────────────────────────
      if (meta && e.key === 'c' && onCopy)  { e.preventDefault(); onCopy();  return }
      if (meta && e.key === 'v' && onPaste) { e.preventDefault(); onPaste(); return }

      // ── Help dialog ─────────────────────────────────────────────────────
      // Cmd/Ctrl + / — `/` shifts to `?` on US layout so accept both.
      if (meta && (e.key === '/' || e.key === '?') && onShowHelp) {
        e.preventDefault(); onShowHelp(); return
      }

      // ── Group / Ungroup ────────────────────────────────────────────────
      if (meta && e.key === 'g' && !e.shiftKey && onGroupSelected) {
        e.preventDefault(); onGroupSelected(); return
      }
      if (meta && e.shiftKey && (e.key === 'g' || e.key === 'G') && onUngroupSelected) {
        e.preventDefault(); onUngroupSelected(); return
      }

      // ── Tool shortcuts (single key, no modifier) ───────────────────────
      // V Select, H Pan, P Pen, G Move, R Rotate, S Scale, A Anchor.
      // BL-60 Faz 3: B Box-select, L Lasso, O Circle, W Paint.
      // Skip when any modifier is held so Cmd+G (group) keeps working.
      if (onToolChange && !meta && !e.shiftKey && !e.altKey) {
        const k = e.key.toLowerCase()
        const map: Record<string, ToolMode> = {
          v: 'select', h: 'pan', p: 'pen',
          g: 'move', r: 'rotate', s: 'scale', a: 'anchor',
          b: 'selection-box', l: 'selection-lasso',
          o: 'selection-circle', w: 'selection-paint',
        }
        const next = map[k]
        if (next) { e.preventDefault(); onToolChange(next); return }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [
    onUndo, onRedo, onPlayToggle,
    onStepBack, onStepForward,
    onDeleteSelected, onDuplicateSelected,
    onCopy, onPaste, onShowHelp,
    onGroupSelected, onUngroupSelected,
    onCloneQuick, onOpenArrayModal,
    onToolChange,
  ])
}
