'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import type { EditorDisplaySnapshot } from './displayPolicy'

/** Outside a guarded workspace, standalone panels/QA retain their old behavior. */
export const EditorDisplayContext = createContext(true)
/** UI availability only; never use this preference to trim source/export data. */
export const useEditorDisplayAvailable = () => useContext(EditorDisplayContext)

/** SSR-safe viewport/capability observation. Resize is coalesced to one frame;
 * pointer hot-plug/orientation changes reuse the same read. Cleanup removes all
 * listeners and pending work. No polling, localStorage or device-name sniffing. */
export function useEditorDisplay() {
  const [snapshot, setSnapshot] = useState<EditorDisplaySnapshot | null>(null)
  useEffect(() => {
    const pointer = window.matchMedia('(any-pointer: fine)')
    let frame: number | null = null
    const read = () => {
      frame = null
      const next = { width: window.innerWidth, height: window.innerHeight, finePointer: pointer.matches }
      setSnapshot(previous => previous?.width === next.width && previous.height === next.height && previous.finePointer === next.finePointer ? previous : next)
    }
    const schedule = () => { if (frame == null) frame = requestAnimationFrame(read) }
    read(); window.addEventListener('resize', schedule); pointer.addEventListener('change', schedule)
    return () => {
      window.removeEventListener('resize', schedule); pointer.removeEventListener('change', schedule)
      if (frame != null) cancelAnimationFrame(frame)
    }
  }, [])
  return snapshot
}
