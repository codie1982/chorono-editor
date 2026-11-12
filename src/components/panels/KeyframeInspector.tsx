'use client'
import { DocumentationHelp } from '@/components/help/DocumentationHelp'
import { useMemo } from 'react'
import type { ChronoScene, Keyframe, EasingType, EasingDefinition } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import {
  makeMoveKfCmd, makeUpdateKfValueCmd, makeUpdateEasingCmd, makeDeleteKfCmd,
} from '@/lib/editor/commands-keyframe'
import ScrubInput from '../inputs/ScrubInput'
import { CalculationButton } from '../inputs/expressions/CalculationButton'
import { expressionValueType } from '@/lib/core/expression/ExpressionValue'
import { isColorTarget } from '@/lib/animation/typedValues'
import BezierEditor from '../timeline/BezierEditor'
import { resolveSelectedKeyframes } from '@/lib/timeline/keyframeSelection'
import { makeBatchCmd } from '@/lib/editor/commands-batch'

interface Props {
  scene: ChronoScene
  selectedTimelineId: string | null
  selectedKfIds: Set<string>
  editor: EditorStateReturn
}

interface ResolvedKf {
  kf: Keyframe
  timelineId: string
  trackTarget: string
}

const EASING_OPTS: EasingType[] = ['linear', 'easeOut', 'easeIn', 'easeInOut', 'hold', 'customBezier']
const DEFAULT_BEZIER = { cx1: 0.42, cy1: 0, cx2: 0.58, cy2: 1 } as const

/**
 * Read-write inspector for selected keyframes.
 *
 *  - Single selection: shows full editable detail (time, value, easing, bezier)
 *  - Multi selection:  shows count and offers bulk easing change + delete
 *
 * Inspector edits dispatch dedicated commands so each becomes its own undo step.
 */
export default function KeyframeInspector({ scene, selectedTimelineId, selectedKfIds, editor }: Props) {
  // ── Locate every selected kf in the scene ────────────────────────────────
  const resolved = useMemo<ResolvedKf[]>(() => {
    return resolveSelectedKeyframes(scene, selectedTimelineId, selectedKfIds)
      .map(({ kf, timelineId, target }) => ({ kf, timelineId, trackTarget: target }))
  }, [scene, selectedTimelineId, selectedKfIds])

  if (resolved.length === 0) return null

  return (
    <div className="border-t border-gray-700" data-panel="curveEditor">
      <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Keyframe ({resolved.length})
        </span>
        <DocumentationHelp topic="editor/keyframes/inspector" className="ml-auto mr-1" />
        <button
          onClick={() => editor.dispatchCommand(makeBatchCmd('Delete Selected Keyframes', resolved.map((r) =>
            makeDeleteKfCmd(r.timelineId, r.trackTarget, r.kf),
          )))}
          className="text-[10px] text-red-400 hover:text-red-300"
        >
          Delete all
        </button>
      </div>

      {resolved.length === 1
        ? <SingleKfInspector entry={resolved[0]} editor={editor} />
        : <MultiKfInspector entries={resolved} editor={editor} />}
    </div>
  )
}

// ── Single-keyframe detail ───────────────────────────────────────────────────

function SingleKfInspector({ entry, editor }: { entry: ResolvedKf; editor: EditorStateReturn }) {
  const { kf, timelineId, trackTarget } = entry
  const easingType = kf.easing?.type ?? 'linear'

  /** Literal and calculate-once writes share native key commands. The original
   * key ID/value is preserved for exact Undo; no controller or recipe is added. */
  const commitTime = (raw: number) => {
    const duration = editor.getScene().timelines.find(tl => tl.id === timelineId)?.durationMs ?? Infinity
    const ms = Math.max(0, Math.min(duration, raw))
    if (Number.isFinite(ms) && ms !== kf.timeMs) editor.dispatchCommand(makeMoveKfCmd(timelineId, trackTarget, kf.id, kf.timeMs, ms))
  }
  const kind = isColorTarget(trackTarget) ? 'color' : expressionValueType(kf.value)
  const updateEasing = (next: EasingDefinition) => {
    editor.dispatchCommand(makeUpdateEasingCmd(timelineId, trackTarget, kf.id, kf.easing, next))
  }

  return (
    <div className="p-3 space-y-2 text-xs">
      <div className="text-[10px] text-gray-500 truncate font-mono" title={trackTarget}>
        {trackTarget}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-gray-500 uppercase">Time (ms)</span>
          <ScrubInput disableScrub key={kf.id + ':time'} fieldLabel="Key time (ms)" value={kf.timeMs} min={0}
            onChange={commitTime} />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-gray-500 uppercase">Value</span>
          {typeof kf.value === 'number' ? <ScrubInput disableScrub key={kf.id + ':value'} fieldLabel="Key value" value={kf.value}
            onChange={value => editor.dispatchCommand(makeUpdateKfValueCmd(timelineId, trackTarget, kf.id, kf.value, value))} />
            : <div className="flex items-center gap-1"><output className="truncate">{JSON.stringify(kf.value)}</output>{kind && <CalculationButton key={kf.id} label="Key value" kind={kind} value={kf.value}
              onResult={value => editor.dispatchCommand(makeUpdateKfValueCmd(timelineId, trackTarget, kf.id, kf.value, value))} />}</div>}
        </label>
      </div>

      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] text-gray-500 uppercase">Easing</span>
        <select
          value={easingType}
          onChange={(e) => {
            const type = e.target.value as EasingType
            updateEasing(type === 'customBezier'
              ? { type, bezier: kf.easing?.bezier ?? DEFAULT_BEZIER }
              : { type })
          }}
          className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray-200 focus:outline-none focus:border-blue-500"
        >
          {EASING_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>

      {easingType === 'customBezier' && (
        <div className="flex justify-center pt-1">
          <BezierEditor
            value={kf.easing?.bezier ?? DEFAULT_BEZIER}
            onChange={(b) => updateEasing({ type: 'customBezier', bezier: b })}
          />
        </div>
      )}
    </div>
  )
}

// ── Multi-keyframe bulk inspector ────────────────────────────────────────────

function MultiKfInspector({ entries, editor }: { entries: ResolvedKf[]; editor: EditorStateReturn }) {
  // If all selected kfs share the same easing type, show it; otherwise show "(mixed)"
  const allSameType = entries.every((e, _, arr) => (e.kf.easing?.type ?? 'linear') === (arr[0].kf.easing?.type ?? 'linear'))
  const sharedType  = allSameType ? (entries[0].kf.easing?.type ?? 'linear') : ''

  const setEasingAll = (type: EasingType) => {
    const commands = entries.map((r) => {
      const next: EasingDefinition = type === 'customBezier'
        ? { type, bezier: r.kf.easing?.bezier ?? DEFAULT_BEZIER }
        : { type }
      return makeUpdateEasingCmd(r.timelineId, r.trackTarget, r.kf.id, r.kf.easing, next)
    })
    editor.dispatchCommand(makeBatchCmd('Change Selected Keyframe Easing', commands))
  }

  return (
    <div className="p-3 space-y-2 text-xs text-gray-400">
      <div className="text-[11px]">
        {entries.length} keyframes selected. Common edits below; for detail, select a single kf.
      </div>
      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] text-gray-500 uppercase">Easing (apply to all)</span>
        <select
          value={sharedType}
          onChange={(e) => setEasingAll(e.target.value as EasingType)}
          className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray-200 focus:outline-none focus:border-blue-500"
        >
          {!sharedType && <option value="" disabled>(mixed)</option>}
          {EASING_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    </div>
  )
}
