'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { applicationBuildInfo } from '@/lib/version'
import { claimReleaseNotesDisplay, featuredReleaseNotes } from './releaseNotes'

/** Owns the once-per-release browser announcement, outside scene and Undo.
 * Waits for the Welcome dialog to resolve so native modals never stack. */
export function useReleaseNotes(welcomeReady: boolean, welcomeOpen: boolean) {
  const [isOpen, setOpen] = useState(false)
  const [isReady, setReady] = useState(false)
  const attempted = useRef(false)

  useEffect(() => {
    if (!welcomeReady || welcomeOpen || attempted.current) return
    // React Strict Mode can replay mount effects; claim the announcement once.
    attempted.current = true
    let show = false
    try { show = claimReleaseNotesDisplay(window.localStorage, applicationBuildInfo.appVersion, featuredReleaseNotes.version) }
    catch { /* No durable storage: skip automatic display. */ }
    setOpen(show)
    setReady(true)
  }, [welcomeReady, welcomeOpen])

  const open = useCallback(() => setOpen(true), [])
  const close = useCallback(() => setOpen(false), [])
  return { isOpen, isReady, open, close }
}
