import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChronoScene } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { drawTrajectory, type TrajectoryEditResult } from '@/lib/timeline/trajectory/commands'
import type { MotionDrawSettings } from './types'

interface Options {
  scene: ChronoScene
  editor: EditorStateReturn
  timelineId: string
  layerId: string
  localTimeMs: number
  durationMs: number
  contextKey: string
  documentSignal: AbortSignal
  apply: (build: () => TrajectoryEditResult) => boolean
  onWarning: (message: string) => void
}

/** Own only a bounded transient click-to-place route and its prepared command.
 * Preview never enters editor scene/history. The first point pins source and
 * document identity; Apply commits that exact plan or rejects it as stale.
 * Source/scope/document changes clear the draft rather than replaying clicks on
 * newer source. The editor remains the only owner of source/undo resources. */
export function useMotionDrawing(options: Options) {
  const [points, setPoints] = useState<Array<{ x: number; y: number }>>([])
  const [settings, setSettings] = useState<MotionDrawSettings>({ startMs: options.localTimeMs,
    endMs: Math.min(options.durationMs, options.localTimeMs + 1000), distribution: 'equal-time', mode: 'append' })
  const source = useRef<{ scene: ChronoScene; document: AbortSignal } | null>(null)
  const clear = useCallback(() => { source.current = null; setPoints([]) }, [])
  useEffect(() => {
    clear()
    setSettings({ startMs: options.localTimeMs, endMs: Math.min(options.durationMs, options.localTimeMs + 1000),
      distribution: 'equal-time', mode: 'append' })
  }, [options.contextKey, options.documentSignal, clear])
  useEffect(() => {
    if (source.current && source.current.scene !== options.scene) {
      clear(); options.onWarning('The scene changed. Place a new route against the current source.')
    }
  }, [options.scene, clear, options.onWarning])
  const add = useCallback((point: { x: number; y: number }) => {
    if (options.editor.isTransactionActive()) return
    if (points.length >= 128) { options.onWarning('Route limit: 128 points. Clear points to draw again.'); return }
    source.current ??= { scene: options.editor.getScene(), document: options.documentSignal }
    setPoints(previous => [...previous, point])
  }, [options.editor, options.documentSignal, options.onWarning, points.length])
  const preview = useMemo(() => {
    if (points.length < 2 || !source.current) return { result: null, scene: null, warning: '' }
    if (source.current.scene !== options.scene || source.current.document !== options.documentSignal || options.documentSignal.aborted) {
      return { result: null, scene: null, warning: 'Route preview is stale; place a new route.' }
    }
    try {
      const result = drawTrajectory(source.current.scene, { timelineId: options.timelineId, layerId: options.layerId,
        worldPoints: points, ...settings, replaceRange: settings.mode === 'replace-range' ? { startMs: settings.startMs, endMs: settings.endMs } : undefined })
      return { result, scene: result.command?.execute(source.current.scene) ?? source.current.scene, warning: result.diagnostics.join(' ') }
    } catch (error) { return { result: null, scene: null, warning: error instanceof Error ? error.message : String(error) } }
  }, [points, settings, options.scene, options.documentSignal, options.timelineId, options.layerId])
  const apply = useCallback(() => {
    if (!preview.result || !source.current) return
    if (source.current.scene !== options.editor.getScene() || source.current.document !== options.editor.getDocumentSignal()
        || source.current.document.aborted) { clear(); options.onWarning('The route source changed. Draw a new preview before Apply.'); return }
    if (options.apply(() => preview.result!)) clear()
  }, [preview.result, options.editor, options.apply, options.onWarning, clear])
  return { points, settings, setSettings, add, clear, previewScene: preview.scene, warning: preview.warning,
    canApply: !!preview.result?.command, apply }
}
