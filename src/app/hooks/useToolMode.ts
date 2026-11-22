'use client'
import { useCallback, useRef, useState, type SetStateAction } from 'react'
import type { ToolMode } from '@/components/TopToolbar/ToolGroup'
import { legacySelectionStyle, type SelectionRegionStyle } from '@/lib/selection/selectionGesture'

/** Owns the editor tool and its last non-Pan mode. Toolbar and keyboard Pan
 * toggles share the same return target; explicit tool changes replace it.
 * Region style is a separate preference (Box by default); B/L/O/W compatibility
 * requests change that preference without replacing Move/Rotate/Scale or Pan.
 * This is transient editor state, independent of scene/history/selection. */
export function useToolMode(initial: ToolMode = 'select') {
  const initialMode = legacySelectionStyle(initial) ? 'select' : initial
  const [mode, setState] = useState<ToolMode>(initialMode)
  const [selectionStyle, setSelectionStyle] = useState<SelectionRegionStyle>(legacySelectionStyle(initial) ?? 'box')
  const current = useRef(initialMode), previous = useRef<ToolMode>(initialMode === 'pan' ? 'select' : initialMode)
  const setMode = useCallback((value: SetStateAction<ToolMode>) => {
    const next = typeof value === 'function' ? value(current.current) : value
    const style = legacySelectionStyle(next)
    if (style) { setSelectionStyle(style); return }
    if (next !== 'pan') previous.current = next
    current.current = next
    setState(next)
  }, [])
  const setPan = useCallback((enabled: boolean) => setMode(enabled ? 'pan' : previous.current), [setMode])
  const togglePan = useCallback(() => setPan(current.current !== 'pan'), [setPan])
  const chooseTool = useCallback((next: ToolMode) => next === 'pan' ? togglePan() : setMode(next), [setMode, togglePan])
  return { mode, setMode, setPan, togglePan, chooseTool, selectionStyle, setSelectionStyle }
}
