'use client'
import { useCallback, useEffect, useState } from 'react'
import type { ChronoScene, Layer } from '@/lib/types'
import type { ExternalTimelineTime } from '@/lib/evaluator'
import { makeRigWeightCommand, type RigWeightAction } from '@/lib/rig2d/matchPose'
import { makeUnlinkKeepPoseCommand, measureUnlinkPose } from '@/lib/rig2d/unlinkKeepPose'
import type { SceneFrameResult } from '@/lib/runtime/evaluateSceneFrame'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import { makePivotCommand, type LinkAction } from '@/lib/rig2d/commands'
import { supportsPivotLink } from '@/lib/rig2d/frame'

export type PivotPick = { ownerId: string } & (
  { step: 'driver' } | { step: 'lower' } | { step: 'target'; lowerId: string }
)

export const pickPrompt = {
  driver: 'Click the layer to follow',
  lower: 'Click the linked lower segment',
  target: 'Click the IK target at the tip',
}

/** Choose among visible hits in stacking order. This inexpensive filter handles
 * grouping and overlapped shapes. The native command validates graph cycles,
 * edit locks and the evaluated bind pose before committing. */
export function acceptsPivotPick(pick: PivotPick, owner: Layer, candidate: Layer): boolean {
  if (owner.id !== pick.ownerId || candidate.id === owner.id || candidate.parentId !== owner.parentId || !supportsPivotLink(candidate)) return false
  if (pick.step === 'lower') return candidate.pivotLink2d?.driverId === owner.id && !candidate.twoBoneIK2d
  return pick.step !== 'target' || candidate.id !== pick.lowerId
}

/** Own a transient viewport pick for the inspected layer. IK captures its lower
 * segment first and commits once on the target click. Escape, owner/document
 * changes, leaving the tab and playback discard the pending pick without Undo. */
export function usePivotPicking(scene: ChronoScene, owner: Layer | null, timeMs: number, frame: Pick<SceneFrameResult, 'overrides' | 'ikDiagnostics' | 'rigSourceOverrides'>,
  dispatch: (cmd: EditorCommand) => void, isBusy: () => boolean, document: AbortSignal, disabled: boolean, clock: ExternalTimelineTime | null, autoKey: boolean) {
  const [pending, setPending] = useState<PivotPick | null>(null)
  const [error, setError] = useState('')
  const cancel = useCallback(() => { setPending(null); setError('') }, [])
  useEffect(() => { cancel() }, [owner?.id, document, disabled, cancel])
  const pick = !disabled && pending?.ownerId === owner?.id ? pending : null
  useEffect(() => {
    if (!pick) return
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      cancel()
    }
    window.addEventListener('keydown', escape, true)
    return () => window.removeEventListener('keydown', escape, true)
  }, [pick, cancel])
  const apply = (action: LinkAction | RigWeightAction | { kind: 'unlinkKeepPose' }) => {
    if (!owner || document.aborted) return
    try {
      if (disabled || isBusy()) throw new Error('Finish playback or the current edit first.')
      if (action.kind === 'setWeight' || action.kind === 'matchFK' || action.kind === 'matchIK')
        dispatch(makeRigWeightCommand(scene, owner, action, frame, clock, timeMs, autoKey))
      else dispatch(action.kind === 'unlinkKeepPose'
        ? makeUnlinkKeepPoseCommand(scene, owner, frame, clock)
        : makePivotCommand(scene, owner.id, action, timeMs, frame.overrides, frame.ikDiagnostics))
      cancel()
    } catch (issue) { setError(issue instanceof Error ? issue.message : String(issue)) }
  }
  const begin = (step: 'driver' | 'lower') => {
    if (!owner || disabled || document.aborted) return
    setError('')
    setPending({ ownerId: owner.id, step })
  }
  const choose = (id: string | null) => {
    if (!owner || !pick || document.aborted) return false
    const candidate = scene.layers.find(item => item.id === id)
    if (!candidate || !acceptsPivotPick(pick, owner, candidate)) setError(pickPrompt[pick.step] + ' in the same group.')
    else if (pick.step === 'lower') {
      setError('')
      setPending({ ownerId: owner.id, step: 'target', lowerId: candidate.id })
    } else apply(pick.step === 'driver' ? { kind: 'link', driverId: candidate.id } : { kind: 'ik', lowerId: pick.lowerId, targetId: candidate.id })
    return true
  }
  const unlinkEdits = () => owner?.pivotLink2d ? measureUnlinkPose(scene, owner, frame, clock?.timelineId).edits : []
  return { pick, begin, choose, cancel, apply, disabled, error, unlinkEdits }
}

export type PivotPicking = ReturnType<typeof usePivotPicking>
