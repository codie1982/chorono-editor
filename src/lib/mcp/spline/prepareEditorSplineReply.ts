import type { ChronoScene } from '../../types'
import type { OutputScope } from '../../export/resources'
import type { SplineExecutors, SplineWorkload } from './prepareSplineWorkload'
import { prepareSplineWorkload } from './prepareSplineWorkload'
import { previewOutput } from '../output/PreviewOutput'
import { assertScene } from '../protocol'

/** One temporary editor-side source draft and optional actual PNG. Document and
 * request cancellation terminate the same worker job. The source guard is
 * checked after every async boundary, including encoding; no stale reply can
 * become a plan. Output scope owns PNG lifetime; broker retains source only. */
export async function prepareEditorSplineReply(scene: ChronoScene, input: SplineWorkload & { previewWidth?: number }, scope: OutputScope,
  ensureCurrent: () => void, documentSignal: AbortSignal, requestSignal?: AbortSignal, executors?: SplineExecutors) {
  const cancel = new AbortController(), abort = () => cancel.abort(), signals = [documentSignal, ...(requestSignal ? [requestSignal] : [])]
  signals.forEach(signal => signal.addEventListener('abort', abort, { once: true }))
  if (signals.some(signal => signal.aborted)) cancel.abort()
  try {
    const prepared = await prepareSplineWorkload(scene, input, cancel.signal, executors)
    ensureCurrent(); assertScene(prepared.scene)
    const previewWidth = input.previewWidth ?? Math.min(640, scene.composition.width)
    const preview = previewWidth ? await previewOutput(prepared.scene, prepared.timeMs, previewWidth, prepared.frame, scope, cancel.signal) : undefined
    ensureCurrent()
    return { scene: prepared.scene, result: prepared.result, authoringHints: prepared.authoringHints, commandCount: prepared.commandCount, timeMs: prepared.timeMs, ...(preview ?? {}) }
  } finally { signals.forEach(signal => signal.removeEventListener('abort', abort)) }
}
