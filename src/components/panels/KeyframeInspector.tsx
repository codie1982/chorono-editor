'use client'
import { useState, useMemo } from 'react'
import type { ChronoScene, Keyframe, EasingType, EasingDefinition } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import {
  makeMoveKfCmd, makeUpdateKfValueCmd, makeUpdateEasingCmd, makeDeleteKfCmd,
} from '@/lib/editor/commands-keyframe'
import BezierEditor from '../timeline/BezierEditor'

interface Props {
  scene: ChronoScene
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
export default function KeyframeInspector({ scene, selectedKfIds, editor }: Props) {
  // ── Locate every selected kf in the scene ────────────────────────────────
  const resolved = useMemo<ResolvedKf[]>(() => {
    const out: ResolvedKf[] = []
    for (const tl of scene.timelines) {
      for (const track of tl.tracks) {
        for (const kf of track.keyframes) {
          if (selectedKfIds.has(kf.id)) {
            out.push({ kf, timelineId: tl.id, trackTarget: track.target })
          }
        }
      }
    }
    return out
  }, [scene.timelines, selectedKfIds])

  if (resolved.length === 0) return null

  return (
    <div className="border-t border-gray-700">
      <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Keyframe ({resolved.length})
        </span>
        <button
          onClick={() => resolved.forEach((r) =>
            editor.dispatchCommand(makeDeleteKfCmd(r.timelineId, r.trackTarget, r.kf)),
          )}
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

  // Local draft for value / time inputs so typing doesn't trigger a command on each keystroke.
  const [timeDraft,  setTimeDraft]  = useState<string>(String(kf.timeMs))
  const [valueDraft, setValueDraft] = useState<string>(
    typeof kf.value === 'number' ? String(kf.value) : String(kf.value),
  )

  // Re-seed drafts when the kf identity changes (different keyframe selected)
  useMemo(() => {
    setTimeDraft(String(kf.timeMs))
    setValueDraft(typeof kf.value === 'number' ? String(kf.value) : String(kf.value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kf.id])

  const commitTime = () => {
    const ms = Number(timeDraft)
    if (!Number.isFinite(ms) || ms === kf.timeMs) { setTimeDraft(String(kf.timeMs)); return }
    editor.dispatchCommand(makeMoveKfCmd(timelineId, trackTarget, kf.id, kf.timeMs, ms))
  }
  const commitValue = () => {
    if (typeof kf.value !== 'number') return  // only number editing here for now
    const v = Number(valueDraft)
    if (!Number.isFinite(v) || v === kf.value) { setValueDraft(String(kf.value)); return }
    editor.dispatchCommand(makeUpdateKfValueCmd(timelineId, trackTarget, kf.id, kf.value, v))
  }

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
          <input
            type="number"
            value={timeDraft}
            onChange={(e) => setTimeDraft(e.target.value)}
            onBlur={commitTime}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray-200 focus:outline-none focus:border-blue-500"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-gray-500 uppercase">Value</span>
          <input
            type={typeof kf.value === 'number' ? 'number' : 'text'}
            value={valueDraft}
            onChange={(e) => setValueDraft(e.target.value)}
            onBlur={commitValue}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            disabled={typeof kf.value !== 'number'}
            className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray-200 focus:outline-none focus:border-blue-500 disabled:opacity-50"
          />
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
    entries.forEach((r) => {
      const next: EasingDefinition = type === 'customBezier'
        ? { type, bezier: r.kf.easing?.bezier ?? DEFAULT_BEZIER }
        : { type }
      editor.dispatchCommand(makeUpdateEasingCmd(r.timelineId, r.trackTarget, r.kf.id, r.kf.easing, next))
    })
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
