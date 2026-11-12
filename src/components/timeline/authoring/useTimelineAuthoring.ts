'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChronoScene } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { prepareSetKey, type SetKeyPlan } from '@/lib/timeline/authoring/setKey'
import type { KeysetMode } from '@/lib/timeline/authoring/keyableChannels'
import type { KeyCollisionPolicy } from '@/lib/timeline/authoring/keyframeBatch'
import { authoringTime, navigateTimeline, type TimelineNavigation } from '@/lib/timeline/authoring/timelineNavigation'

interface Params {
  scene: ChronoScene; editor: EditorStateReturn; timelineId: string | null
  selectedId: string | null; selectedIds: ReadonlySet<string>; selectedKeyIds: ReadonlySet<string>
  currentTimeMs: number; isPlaying: boolean; timeBasis?: 'global' | 'local'; enabled?: boolean
  onSeek: (timeMs: number) => void
}

/** React command owner shared by toolbar and keyboard. Modes/review notices are
 * UI only. Reads current committed source for every action. A partial Set Key
 * requires explicit review/apply; pending IDs survive review but stale source
 * refuses. No scene copy, polling, resource handles or hidden mutation timer.
 */
export function useTimelineAuthoring(params: Params) {
  const [keyset, setKeyset] = useState<KeysetMode>('all')
  const [collisionPolicy, setCollisionPolicy] = useState<KeyCollisionPolicy>('reject')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState<SetKeyPlan | null>(null)
  const latest = useRef(params); latest.current = params
  const timeline = params.scene.timelines.find(item => item.id === params.timelineId)
  const localTimeMs = timeline ? authoringTime(timeline, params.currentTimeMs, params.timeBasis === 'global' && params.isPlaying ? 'globalPlayback' : 'local') : 0
  const selectedCount = params.selectedIds.size || (params.selectedId ? 1 : 0)
  const disabled = !timeline || params.enabled === false || params.editor.isTransactionActive?.()
  const selectedTargets = useMemo(() => new Set(timeline?.tracks.filter(track => track.keyframes.some(key => params.selectedKeyIds.has(key.id))).map(track => track.target)), [timeline, params.selectedKeyIds])
  useEffect(() => { setPending(null); setNotice('') }, [params.timelineId])
  const executePlan = useCallback((plan: SetKeyPlan) => {
    const current = latest.current
    if (!plan.command || current.enabled === false || current.editor.isTransactionActive?.()) return
    try { current.editor.dispatchCommand(plan.command); setNotice(`Set ${plan.targets.length} channels at ${plan.timeMs.toFixed(3)} ms.`) }
    catch (error) { setNotice((error as Error).message) }
    setPending(null)
  }, [])
  const setKey = useCallback((paths?: readonly string[]) => {
    const current = latest.current
    if (!current.timelineId || current.enabled === false || current.editor.isTransactionActive?.()) return
    const source = current.editor.getScene(), active = source.timelines.find(item => item.id === current.timelineId)
    if (!active) return
    try {
      const ids = Array.from(current.selectedIds.size ? current.selectedIds : current.selectedId ? [current.selectedId] : [])
      const timeMs = authoringTime(active, current.currentTimeMs, current.timeBasis === 'global' && current.isPlaying ? 'globalPlayback' : 'local')
      const plan = prepareSetKey(source, { timelineId: active.id, layerIds: ids, timeMs, keyset: paths ? 'selected' : keyset,
        selectedTargets: paths ? new Set(ids.flatMap(id => paths.map(path => `layers.${id}.${path}`))) : selectedTargets })
      if (plan.diagnostics.length) { setPending(plan); setNotice(`${plan.targets.length} channels ready; ${plan.diagnostics.length} skipped. Review before applying.`) }
      else executePlan(plan)
    } catch (error) { setNotice((error as Error).message) }
  }, [executePlan, keyset, selectedTargets])
  const navigate = useCallback((intent: TimelineNavigation, frames = 1) => {
    const current = latest.current
    if (!current.timelineId || current.enabled === false || current.editor.isTransactionActive?.()) return
    const source = current.editor.getScene(), active = source.timelines.find(item => item.id === current.timelineId)
    if (!active) return
    const timeMs = authoringTime(active, current.currentTimeMs, current.timeBasis === 'global' && current.isPlaying ? 'globalPlayback' : 'local')
    current.onSeek(navigateTimeline(source, active.id, timeMs, intent, current.selectedIds.size ? current.selectedIds : new Set(current.selectedId ? [current.selectedId] : []), frames))
  }, [])
  return { keyset, setKeyset, setKey, navigate, localTimeMs, selectedCount, disabled,
    collisionPolicy, setCollisionPolicy, notice, pending, applyPending: () => pending && executePlan(pending),
    dismiss: () => { setPending(null); setNotice('') }, scopeLabel: selectedCount ? `${selectedCount} selected branches` : 'Active timeline' }
}
export type TimelineAuthoringControls = ReturnType<typeof useTimelineAuthoring>
