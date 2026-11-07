'use client'

import { useCallback, useEffect, useState } from 'react'

const STARTUP_KEY = 'chorono.welcome.showOnStartup'

/**
 * Owns welcome visibility and one bounded browser preference, outside scene
 * JSON/history. Scene contents and file handles are never copied into storage.
 * Reads only after hydration; blocked storage falls back to showing welcome.
 */
export function useWelcomeScreen() {
  const [isOpen, setOpen] = useState(false)
  const [showOnStartup, setShowOnStartup] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let show = true
    try { show = localStorage.getItem(STARTUP_KEY) !== 'false' } catch { /* Browser storage can be disabled. */ }
    setShowOnStartup(show)
    setOpen(show)
  }, [])

  /** Opens the existing workspace's welcome view without replacing any scene data. */
  const open = useCallback(() => { setError(null); setOpen(true) }, [])
  /** Returns to the current workspace; native dialog handles focus restoration. */
  const close = useCallback(() => { setError(null); setOpen(false) }, [])
  /** Persists only the startup toggle; the current session remains usable on quota/security errors. */
  const changeStartup = useCallback((show: boolean) => {
    setShowOnStartup(show)
    try { localStorage.setItem(STARTUP_KEY, String(show)) } catch { /* Preference is still applied for this session. */ }
  }, [])

  return { isOpen, showOnStartup, error, open, close, changeStartup, setError }
}
