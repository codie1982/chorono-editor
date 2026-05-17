/**
 * Hook for managing timeline ghost/onion-skin state and persistence.
 */

import { useState, useEffect, useCallback } from 'react'
import type { TimelineGhostSettings } from '@/lib/types/editor'
import { DEFAULT_TIMELINE_GHOST_SETTINGS } from '@/lib/types/editor'

const STORAGE_KEY = 'chorono.timeline.ghost'

export function useTimelineGhost() {
  const [ghostSettings, setGhostSettings] = useState<TimelineGhostSettings>(() => {
    // Load from localStorage or use defaults
    if (typeof window === 'undefined') return DEFAULT_TIMELINE_GHOST_SETTINGS

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        // Validate and merge with defaults (in case new fields were added)
        return {
          ...DEFAULT_TIMELINE_GHOST_SETTINGS,
          ...parsed,
        }
      }
    } catch {
      // localStorage error or invalid JSON — fall through to default
    }

    return DEFAULT_TIMELINE_GHOST_SETTINGS
  })

  // Persist to localStorage whenever settings change
  useEffect(() => {
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
