import { useEffect } from 'react'
import { hasVisibleKeyboardScope } from '@/lib/shortcuts/keyboardScope'

interface Options {
  active: boolean
  canEdit: boolean
  hasSelection: boolean
  remove: () => void
  move: (dx: number, dy: number) => void
  cancel: () => void
}

/** Canvas motion editing owns spatial arrows/Delete while active, ahead of
 * object shortcuts. Inputs, native selects, menus/dialogs and other editor
 * panels retain their keys. Escape explicitly cancels its shared drag owner
 * before stopping propagation; no pointer/window lifecycle is recreated here. */
export function useMotionKeyboard(options: Options) {
  useEffect(() => {
    if (!options.active) return
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.defaultPrevented || event.isComposing || !target || target.isContentEditable
          || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
          || target.closest?.('[role="menu"], [role="dialog"], [aria-modal="true"]') || hasVisibleKeyboardScope()) return
      const panel = target.closest?.<HTMLElement>('[data-panel]')?.dataset.panel
      if (panel && panel !== 'canvas') return
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); options.cancel(); return }
      if (!options.canEdit || !options.hasSelection || event.metaKey || event.ctrlKey || event.altKey) return
      const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
      const delta = directions[event.key]
      if (delta || event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault(); event.stopPropagation()
        if (delta) options.move(delta[0] * (event.shiftKey ? 10 : 1), delta[1] * (event.shiftKey ? 10 : 1))
        else options.remove()
      }
    }
    document.addEventListener('keydown', key, true)
    return () => document.removeEventListener('keydown', key, true)
  }, [options.active, options.canEdit, options.hasSelection, options.remove, options.move, options.cancel])
}
