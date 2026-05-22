'use client'
import { useEffect, useRef, type RefObject } from 'react'

/**
 * Closes a popup/dropdown when a mousedown lands outside `ref`.
 * No-op while `active` is false, so listeners attach only when the menu is open.
 */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  active: boolean,
  onOutside: () => void,
): void {
  const cb = useRef(onOutside)
  cb.current = onOutside
  useEffect(() => {
    if (!active) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cb.current()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [active, ref])
}
