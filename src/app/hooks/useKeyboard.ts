'use client'
import { useEffect } from 'react'

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
      if (meta && e.key === 'd') { e.preventDefault(); onDuplicateSelected(); return }

      // ── Copy / Paste keyframes ─────────────────────────────────────────
      if (meta && e.key === 'c' && onCopy)  { e.preventDefault(); onCopy();  return }
      if (meta && e.key === 'v' && onPaste) { e.preventDefault(); onPaste(); return }

      // ── Help dialog ─────────────────────────────────────────────────────
      // Cmd/Ctrl + / — `/` shifts to `?` on US layout so accept both.
      if (meta && (e.key === '/' || e.key === '?') && onShowHelp) {
        e.preventDefault(); onShowHelp(); return
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [
    onUndo, onRedo, onPlayToggle,
    onStepBack, onStepForward,
    onDeleteSelected, onDuplicateSelected,
    onCopy, onPaste, onShowHelp,
  ])
}
