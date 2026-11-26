'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { BakeJobHandle, BakeJobSnapshot } from '@/lib/bake'
import { BakeService, TrackBakeAdapter, createTrackBakeRecipe, type TrackBakePreview } from '@/lib/bake'
import { isSameTrackBakeSource } from '@/lib/animation/baking/TrackBakeSource'
import type { BakeOptions } from '@/lib/animation/baking/bake'
import { makeApplyTrackBakeCmd } from '@/lib/editor/commands-track'
import type { Track } from '@/lib/types'

interface TrackBakeInput {
  timelineId: string
  timelineDurationMs: number
  target: string
  source: Track
  options: BakeOptions
}

/**
 * Bridges the editor's track command to the renderer-independent BakeService.
 *
 * One hook instance owns at most one unpublished job. Re-previewing or changing
 * options disposes the old preview; applying delegates to the existing atomic
 * command, so history/source validation semantics remain authoritative.
 */
export function useTrackBakeJob(editor: EditorStateReturn): {
  snapshot: BakeJobSnapshot<TrackBakePreview> | null
  start(input: TrackBakeInput): void
  cancel(): void
  discard(): void
  checkSource(): boolean
  commit(): Promise<void>
} {
  const service = useRef<BakeService>()
  const job = useRef<BakeJobHandle<TrackBakePreview> | null>(null)
  const expectedSource = useRef<Track | null>(null)
  const unsubscribe = useRef<(() => void) | null>(null)
  const [snapshot, setSnapshot] = useState<BakeJobSnapshot<TrackBakePreview> | null>(null)

  const discard = useCallback(() => {
    unsubscribe.current?.()
    unsubscribe.current = null
    job.current?.dispose()
    job.current = null
    expectedSource.current = null
    setSnapshot(null)
  }, [])

  useEffect(() => () => {
    unsubscribe.current?.()
    unsubscribe.current = null
    service.current?.dispose()
    service.current = undefined
    job.current = null
    expectedSource.current = null
  }, [])

  const start = useCallback((input: TrackBakeInput) => {
    discard()
    const documentSignal = editor.getDocumentSignal()
    const sourceRevision = editor.getRevision()
    const recipe = createTrackBakeRecipe({
      source: { kind: 'track', ownerId: `${input.timelineId}:${input.target}`, revision: sourceRevision },
      timelineId: input.timelineId,
      target: input.target,
      timelineDurationMs: input.timelineDurationMs,
      startMs: input.options.startMs,
      endMs: input.options.endMs,
      fps: input.options.fps,
      tolerance: input.options.tolerance,
    })
    const adapter = new TrackBakeAdapter(input.source)
    service.current ??= new BakeService({ concurrency: 1, maxQueued: 4 })
    const next = service.current.createJob<TrackBakePreview>({
      kind: adapter.kind,
      label: `Bake ${input.target}`,
      source: recipe.source,
      documentSignal,
      isSourceCurrent: () => {
        if (editor.getDocumentSignal() !== documentSignal || documentSignal.aborted) return false
        const timeline = editor.getScene().timelines.find(item => item.id === input.timelineId)
        const current = timeline?.tracks.find(track => track.target === input.target)
        return timeline?.durationMs === input.timelineDurationMs && isSameTrackBakeSource(input.source, current)
      },
      prepare: context => adapter.prepare(recipe, context),
    })
    job.current = next
    expectedSource.current = input.source
    setSnapshot(next.getSnapshot())
    unsubscribe.current = next.subscribe(() => setSnapshot(next.getSnapshot()))
    void next.start()
  }, [discard, editor])

  const cancel = useCallback(() => job.current?.cancel(), [])
  const checkSource = useCallback(() => job.current?.checkSource() ?? true, [])

  const commit = useCallback(async () => {
    const active = job.current
    const source = expectedSource.current
    if (!active || !source) throw new Error('Bake preview is not ready to apply.')
    if (editor.isTransactionActive()) throw new Error('Finish the active gesture before applying this bake.')
    await active.commit(preview => {
      const recipe = preview.recipe
      editor.dispatchCommand(makeApplyTrackBakeCmd(recipe.timelineId, recipe.target, source, preview.track, {
        startMs: recipe.startMs,
        endMs: recipe.endMs,
        fps: recipe.fps,
        tolerance: recipe.tolerance,
        keyIdPrefix: recipe.timelineId,
      }))
    })
  }, [editor])

  return { snapshot, start, cancel, discard, checkSource, commit }
}
