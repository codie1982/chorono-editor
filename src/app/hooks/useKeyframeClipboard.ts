'use client'
import { useCallback, useEffect, useRef } from 'react'
import type { ChronoScene, Keyframe } from '@/lib/types'
import { nextKfId } from '@/lib/defaults'
import { makePasteKfCmd, type KfInsertion } from '@/lib/editor/commands-keyframe'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import type { KeyCollisionPolicy } from '@/lib/timeline/authoring/keyframeBatch'
import { collectKeyframeClipboard } from '@/lib/timeline/keyframeClipboard'

interface ClipboardEntry {
  timelineId: string
  target: string
  kf: Keyframe
  /** Offset (ms) from the earliest selected keyframe's timeMs */
  relativeMs: number
}

interface Params {
  scene: ChronoScene
  selectedKfIds: Set<string>
  selectedTimelineId: string | null
  /** Paste anchor */
  currentTimeMs: number
  collisionPolicy?: KeyCollisionPolicy
  onError?: (message: string) => void
  dispatchCommand: (cmd: EditorCommand) => void
}

interface ClipboardReturn {
  copySelected:   () => void
  pasteAtPlayhead: () => Set<string>
  hasItems:       () => boolean
}

/**
 * Copy / paste for keyframes, keyed off the current selection.
 *
 * Returned callbacks are STABLE (same identity across renders) so consuming
 * keyboard hooks don't re-attach listeners every render. We achieve this by
 * stashing the live params in a ref that is updated each render.
 */
export function useKeyframeClipboard(params: Params): ClipboardReturn {
  const clipboardRef = useRef<ClipboardEntry[]>([])
  const paramsRef    = useRef(params)
  useEffect(() => { paramsRef.current = params })

  const copySelected = useCallback(() => {
    const { selectedKfIds, selectedTimelineId, scene } = paramsRef.current
    if (selectedKfIds.size === 0) return
    const collected = collectKeyframeClipboard(scene, selectedTimelineId, selectedKfIds)
    if (collected.length === 0) return
    clipboardRef.current = collected
  }, [])

  const pasteAtPlayhead = useCallback((): Set<string> => {
    const { selectedTimelineId, currentTimeMs, dispatchCommand, scene } = paramsRef.current
    const entries = clipboardRef.current
    if (entries.length === 0) return new Set()

    const insertions: KfInsertion[] = []
    const newIds = new Set<string>()

    for (const entry of entries) {
      const destTimelineId = selectedTimelineId ?? entry.timelineId
      const tl = scene.timelines.find((t) => t.id === destTimelineId)
      if (!tl || !tl.tracks.some((t) => t.target === entry.target)) { paramsRef.current.onError?.('A copied track is missing in the destination timeline. Nothing was pasted.'); return new Set() }

      const newId = nextKfId()
      newIds.add(newId)
      insertions.push({
        copiedFrom: ['key', entry.timelineId, entry.target, entry.kf.id],
        timelineId: destTimelineId,
        target:     entry.target,
        kf: { ...entry.kf, id: newId, timeMs: currentTimeMs + entry.relativeMs },
      })
    }

    if (insertions.length === 0) return new Set()
    try { dispatchCommand(makePasteKfCmd(insertions, { collisionPolicy: paramsRef.current.collisionPolicy })); return newIds }
    catch (error) { paramsRef.current.onError?.((error as Error).message); return new Set() }
  }, [])

  const hasItems = useCallback(() => clipboardRef.current.length > 0, [])

  return { copySelected, pasteAtPlayhead, hasItems }
}
