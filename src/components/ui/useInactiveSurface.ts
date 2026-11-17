'use client'
import { useLayoutEffect, useRef } from 'react'

/** Retain mounted UI/drafts while disabling native focus and pointer access.
 * Borrow the DOM element's previous inert state and restore it on cleanup.
 * Global keyboard adapters must also honor their host's availability/scope. */
export function useInactiveSurface<T extends HTMLElement>(inactive: boolean) {
  const ref = useRef<T | null>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const previous = element.inert
    element.inert = inactive
    return () => { element.inert = previous }
  }, [inactive])
  return ref
}
