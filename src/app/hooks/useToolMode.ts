'use client'
import { useCallback, useRef, useState, type SetStateAction } from 'react'
import type { ToolMode } from '@/components/TopToolbar/ToolGroup'

/** Owns the editor tool and its last non-Pan mode. Toolbar and keyboard Pan
 * toggles share the same return target; explicit tool changes replace it.
 * This is transient editor state, independent of scene/history/selection. */
export function useToolMode(initial: ToolMode = 'select') {
  const [mode, setState] = useState<ToolMode>(initial)
  const current = useRef(initial), previous = useRef<ToolMode>(initial === 'pan' ? 'select' : initial)
  const setMode = useCallback((value: SetStateAction<ToolMode>) => {
    const next = typeof value === 'function' ? value(current.current) : value
    if (next !== 'pan') previous.current = next
    current.current = next
    setState(next)
  }, [])
  const setPan = useCallback((enabled: boolean) => setMode(enabled ? 'pan' : previous.current), [setMode])
  const togglePan = useCallback(() => setPan(current.current !== 'pan'), [setPan])
  const chooseTool = useCallback((next: ToolMode) => next === 'pan' ? togglePan() : setMode(next), [setMode, togglePan])
  return { mode, setMode, setPan, togglePan, chooseTool }
}
