/**
 * Hook for managing timeline ghost/onion-skin state and persistence.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { TimelineGhostSettings } from '@/lib/types/editor'
import { DEFAULT_TIMELINE_GHOST_SETTINGS } from '@/lib/types/editor'

const STORAGE_KEY = 'chorono.timeline.ghost'

export function useTimelineGhost() {
  // Always start with defaults so server and client first-render agree.
  // Hydration from localStorage happens in the post-mount effect below —
  // this avoids the React hydration mismatch when stored settings differ
  // from defaults (e.g. enabled=true after a previous session toggled it on).
  const [ghostSettings, setGhostSettings] = useState<TimelineGhostSettings>(
    DEFAULT_TIMELINE_GHOST_SETTINGS,
  )
  // Skip the first persist effect until after we've hydrated from storage,
  // so we don't overwrite the stored value with the bare defaults.
  const hydratedRef = useRef(false)

  // Post-mount: read localStorage and adopt the persisted settings if any.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        setGhostSettings({ ...DEFAULT_TIMELINE_GHOST_SETTINGS, ...parsed })
      }
    } catch {
      // localStorage error or invalid JSON — keep defaults
    }
    hydratedRef.current = true
  }, [])

  // Persist to localStorage on any change, but only after hydration completes.
  useEffect(() => {
    if (!hydratedRef.current) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ghostSettings))
    } catch {
      // localStorage full or disabled — silent fail
    }
  }, [ghostSettings])

  // Batch update settings
  const updateGhostSettings = useCallback((patch: Partial<TimelineGhostSettings>) => {
    setGhostSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  // Toggle enabled
  const toggleGhost = useCallback(() => {
    setGhostSettings((prev) => ({ ...prev, enabled: !prev.enabled }))
  }, [])

  // Change scope (all / selected)
  const setScope = useCallback((scope: 'all' | 'selected') => {
    setGhostSettings((prev) => ({ ...prev, scope }))
  }, [])

  // Set frame range
  const setFrameRange = useCallback((beforeFrames: number, afterFrames: number) => {
    setGhostSettings((prev) => ({ ...prev, beforeFrames, afterFrames }))
  }, [])

  // Set opacity
  const setOpacity = useCallback((opacity: number) => {
    setGhostSettings((prev) => ({ ...prev, opacity: Math.max(0, Math.min(100, opacity)) }))
  }, [])

  // Quick presets
  const applyPreset = useCallback((preset: 'off' | 'light' | 'medium' | 'heavy') => {
    switch (preset) {
      case 'off':
        setGhostSettings((prev) => ({ ...prev, enabled: false }))
        break
      case 'light':
        setGhostSettings((prev) => ({
          ...prev,
          enabled: true,
          beforeFrames: 2,
          afterFrames: 2,
          opacity: 20,
        }))
        break
      case 'medium':
        setGhostSettings((prev) => ({
          ...prev,
          enabled: true,
          beforeFrames: 5,
          afterFrames: 5,
          opacity: 30,
        }))
        break
      case 'heavy':
        setGhostSettings((prev) => ({
          ...prev,
          enabled: true,
          beforeFrames: 10,
          afterFrames: 10,
          opacity: 50,
        }))
        break
    }
  }, [])

  return {
    ghostSettings,
    updateGhostSettings,
    toggleGhost,
    setScope,
    setFrameRange,
    setOpacity,
    applyPreset,
  }
}
