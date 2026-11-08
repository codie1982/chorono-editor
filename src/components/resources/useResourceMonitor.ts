'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProjectMonitorSource } from '@/lib/resources/monitor/ProjectResourceMonitor'
import type { MediaQuery } from '@/lib/resources/monitor/mediaResources'
import { observeResourceMonitor } from './observeResourceMonitor'

/**
 * Owns only panel-local snapshots and pause state. The active dock tab mounts this
 * hook; unmount/pause detaches observation, visibility suspends background work.
 * Cleanup explicitly refreshes even a paused snapshot and preserves active leases.
 */
export function useResourceMonitor(source: ProjectMonitorSource) {
  const [snapshot, setSnapshot] = useState(() => source.getSnapshot())
  const [paused, setPaused] = useState(false)
  const [mediaQuery, setMediaQuery] = useState<MediaQuery>({ page: 0, search: '' })
  const mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    if (paused) return
    return observeResourceMonitor(source, document, setSnapshot)
  }, [source, paused])

  /** Drops only idle pool reservations; cumulative usage counters are preserved. */
  const clearIdle = useCallback(() => {
    source.clearIdle()
    setSnapshot(source.getSnapshot())
  }, [source])

  /** Explicit query actions refresh once even while periodic observation is paused. */
  const changeMediaQuery = useCallback((query: MediaQuery) => {
    setMediaQuery(query)
    source.setMediaQuery(query)
    setSnapshot(source.getSnapshot())
  }, [source])

  /** Single-flight platform sampling; a detached/unmounted view is never updated by its completion. */
  const requestMemorySample = useCallback(async () => {
    const pending = source.requestMemorySample()
    setSnapshot(source.getSnapshot())
    await pending
    if (mounted.current) setSnapshot(source.getSnapshot())
  }, [source])

  return { snapshot, paused, setPaused, clearIdle, mediaQuery, changeMediaQuery, requestMemorySample }
}
