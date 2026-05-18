'use client'
// ── CurveModifierStackPanel (BL-46) ────────────────────────────────────────
// Stack inspector for the curve modifiers attached to the currently selected
// track (Track scope) and the currently selected keyframe's segment
// (Segment scope). Mirrors 3ds Max's "Track Modifier Stack" + a per-segment
// modifier strip.
//
// Layout:
//   ┌─────────────────────────────────────┐
//   │ TRACK MODIFIERS         + Add ▾     │
//   │ ✓ ◆ sine          ╳ add 1.0  ✕     │
//   │ ✓ ▥ clamp [0,1]   ✕ replace 1 ✕     │
//   ├─────────────────────────────────────┤
//   │ SEGMENT MODIFIERS (kf "k1" → next)  │
//   │ — no segment modifiers — + Add ▾    │
//   └─────────────────────────────────────┘

import { useMemo, useState } from 'react'
import type {
  ChronoScene, CurveModifier, CurveModifierType, CurveBlendMode, Keyframe,
  TrackController, WaveformShape,
} from '@/lib/types'
import {
  defaultParametersFor, DEFAULT_WAVEFORM_PARAMS, DEFAULT_NOISE_PARAMS,
} from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import {
  makeAddCurveModifierCmd, makeRemoveCurveModifierCmd, makeUpdateCurveModifierCmd,
  makeReorderCurveModifierCmd, nextModifierId, makeSetTrackControllerCmd,
  type ModifierScope,
} from '@/lib/editor/commands-track'

interface Props {
  scene: ChronoScene
  selectedTimelineId: string | null
  /** Property track target currently focused — usually picked by clicking
   *  a track row in the timeline. Falls back to "first track" when null. */
  selectedTrackTarget?: string | null
  /** First selected keyframe id (drives the Segment Modifiers section). */
  selectedKfIds: Set<string>
  editor: EditorStateReturn
}

// Modifier types with shipped evaluators (BL-46 + BL-47 + BL-49).
const FOUNDATION_TYPES: CurveModifierType[] = [
  // BL-46
  'sine', 'pulse', 'quantize', 'offset', 'scale', 'clamp',
  // BL-47
  'noise', 'fractalNoise', 'jitter', 'wave',
  // BL-49
  'overshoot', 'elastic', 'bounce', 'decay', 'spring',
]

const BLEND_MODES: { value: CurveBlendMode; label: string }[] = [
  { value: 'add',      label: 'Add' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'replace',  label: 'Replace' },
  { value: 'blend',    label: 'Blend' },
]

export default function CurveModifierStackPanel({
  scene, selectedTimelineId, selectedTrackTarget, selectedKfIds, editor,
}: Props) {
  const timeline = useMemo(
    () => scene.timelines.find((t) => t.id === selectedTimelineId) ?? null,
    [scene.timelines, selectedTimelineId],
  )
  // Pick the focused track. If caller didn't supply one, infer from the
  // first selected keyframe's containing track.
  const focusTrack = useMemo(() => {
    if (!timeline) return null
    if (selectedTrackTarget) {
      return timeline.tracks.find((t) => t.target === selectedTrackTarget) ?? null
    }
    if (selectedKfIds.size > 0) {
      for (const tr of timeline.tracks) {
        if (tr.keyframes.some((k) => selectedKfIds.has(k.id))) return tr
      }
    }
    return timeline.tracks[0] ?? null
  }, [timeline, selectedTrackTarget, selectedKfIds])

  // Leading kf of the segment under focus — for segment modifiers we edit
  // THIS kf's segmentModifiers array (segment runs leading → next).
  const segmentKf: Keyframe | null = useMemo(() => {
    if (!focusTrack) return null
    const ids = Array.from(selectedKfIds)
    for (const id of ids) {
      const kf = focusTrack.keyframes.find((k) => k.id === id)
      if (kf) return kf
    }
    return null
  }, [focusTrack, selectedKfIds])

  if (!timeline || !focusTrack) {
    return (
      <div className="p-3 text-[11px] text-gray-500 italic">
        Select a track to edit its modifier stack.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 text-[11px] text-gray-300">
      <Header label={`Track: ${focusTrack.target.replace(/^layers\./, '')}`} />

      <ControllerSection
        controller={focusTrack.controller}
        timelineId={timeline.id}
        trackTarget={focusTrack.target}
        editor={editor}
      />

      <ScopeSection
        title="TRACK MODIFIERS"
        modifiers={focusTrack.modifiers ?? []}
        scope={{ kind: 'track', target: focusTrack.target }}
        timelineId={timeline.id}
        editor={editor}
      />

      <Header label={
        segmentKf
          ? `Segment: kf ${segmentKf.id.slice(-6)} → next`
          : 'Segment Modifiers (select a keyframe)'
      } />

      {segmentKf ? (
        <ScopeSection
          title="SEGMENT MODIFIERS"
          modifiers={segmentKf.segmentModifiers ?? []}
          scope={{ kind: 'segment', target: focusTrack.target, keyframeId: segmentKf.id }}
          timelineId={timeline.id}
          editor={editor}
        />
      ) : (
        <div className="p-3 text-[10px] text-gray-600 italic">
          Click a keyframe on the focused track to edit its segment-scope
          modifiers (applied from that key to the next).
        </div>
      )}
    </div>
  )
}

function Header({ label }: { label: string }) {
  return (
    <div className="px-3 py-1.5 border-b border-gray-800 text-[10px] uppercase
                    tracking-wider text-gray-500 font-semibold truncate"
         title={label}>
      {label}
    </div>
  )
}

// ── Scope section (track-modifiers or segment-modifiers) ───────────────────

function ScopeSection({
  title, modifiers, scope, timelineId, editor,
}: {
  title:      string
  modifiers:  CurveModifier[]
  scope:      ModifierScope
  timelineId: string
  editor:     EditorStateReturn
}) {
  const [addOpen, setAddOpen] = useState(false)

  const onAdd = (type: CurveModifierType) => {
    const m: CurveModifier = {
      id: nextModifierId(),
      type,
      enabled: true,
      blendMode: 'add',
      weight: 1,
      parameters: defaultParametersFor(type),
    }
    editor.dispatchCommand(makeAddCurveModifierCmd(timelineId, scope, m))
    setAddOpen(false)
  }

  return (
    <div className="flex flex-col border-b border-gray-800">
      <div className="flex items-center justify-between px-3 py-1 bg-gray-950/40">
        <span className="text-[9px] uppercase tracking-wider text-gray-600">{title}</span>
        <div className="relative">
          <button
            onClick={() => setAddOpen((o) => !o)}
            className="text-[10px] px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white"
          >+ Add Modifier</button>
          {addOpen && (
            <div className="absolute right-0 top-full mt-1 z-30 bg-gray-800 border border-gray-700
                            rounded shadow-xl min-w-[140px] py-1">
              {FOUNDATION_TYPES.map((t) => (
                <button key={t}
                  onClick={() => onAdd(t)}
                  className="w-full text-left px-3 py-1 text-[10px] hover:bg-gray-700 capitalize"
                >{t}</button>
              ))}
            </div>
          )}
        </div>
      </div>
      {modifiers.length === 0 ? (
        <div className="px-3 py-2 text-[10px] text-gray-600 italic">— no modifiers —</div>
      ) : (
        <div>
          {modifiers.map((m, idx) => (
            <ModifierRow
              key={m.id}
              m={m}
              index={idx}
              count={modifiers.length}
              scope={scope}
              timelineId={timelineId}
              editor={editor}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Single modifier row ────────────────────────────────────────────────────

function ModifierRow({
  m, index, count, scope, timelineId, editor,
}: {
  m: CurveModifier
  index: number
  count: number
  scope: ModifierScope
  timelineId: string
  editor: EditorStateReturn
}) {
  const [expanded, setExpanded] = useState(false)

  const patch = (next: Partial<CurveModifier>) => {
    editor.dispatchCommand(makeUpdateCurveModifierCmd(
      timelineId, scope, m.id, m, { ...m, ...next },
    ))
  }
  const remove = () => {
    editor.dispatchCommand(makeRemoveCurveModifierCmd(timelineId, scope, m, index))
  }
  const moveUp = () => {
    if (index === 0) return
    editor.dispatchCommand(makeReorderCurveModifierCmd(timelineId, scope, index, index - 1))
  }
  const moveDown = () => {
    if (index >= count - 1) return
    editor.dispatchCommand(makeReorderCurveModifierCmd(timelineId, scope, index, index + 1))
  }
  const patchParam = (key: string, value: number | boolean | string) => {
    patch({ parameters: { ...m.parameters, [key]: value } })
  }

  return (
    <div className={`border-t border-gray-800/60 ${m.enabled ? '' : 'opacity-50'}`}>
      {/* Header row */}
      <div className="flex items-center gap-1.5 px-3 py-1.5">
        <input
          type="checkbox"
          checked={m.enabled}
          onChange={(e) => patch({ enabled: e.target.checked })}
          className="accent-blue-500"
          title={m.enabled ? 'Disable modifier' : 'Enable modifier'}
        />
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex-1 text-left text-[11px] capitalize hover:text-white truncate"
          title={`Reorder · Remove · Edit params`}
        >
          <span className="text-yellow-400 mr-1">{expanded ? '▾' : '▸'}</span>
          {m.type}
        </button>
        <select
          value={m.blendMode}
          onChange={(e) => patch({ blendMode: e.target.value as CurveBlendMode })}
          className="text-[9px] bg-gray-800 border border-gray-700 rounded px-1 py-0.5"
        >
          {BLEND_MODES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
        <NumberPill
          label="w"
          value={m.weight}
          min={0} max={2} step={0.1}
          onChange={(v) => patch({ weight: v })}
        />
        <button onClick={moveUp}    disabled={index === 0}
                className="text-[9px] px-1 text-gray-500 hover:text-gray-200 disabled:opacity-30"
                title="Move up">↑</button>
        <button onClick={moveDown}  disabled={index >= count - 1}
                className="text-[9px] px-1 text-gray-500 hover:text-gray-200 disabled:opacity-30"
                title="Move down">↓</button>
        <button onClick={remove}
                className="text-[10px] px-1 text-red-400 hover:text-red-300"
                title="Remove modifier">✕</button>
      </div>

      {/* Expanded params */}
      {expanded && (
        <div className="px-3 pb-2 grid grid-cols-2 gap-1.5">
          {Object.entries(m.parameters).map(([key, val]) => (
            <ParamInput key={key} name={key} value={val} onChange={(v) => patchParam(key, v)} />
          ))}
        </div>
      )}
    </div>
  )
}

function NumberPill({ label, value, min, max, step, onChange }: {
  label: string; value: number; min?: number; max?: number; step?: number
  onChange: (v: number) => void
}) {
  return (
    <label className="flex items-center gap-1 text-[9px] text-gray-500">
      <span>{label}</span>
      <input type="number" value={value} min={min} max={max} step={step}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v)) onChange(v)
        }}
        className="w-12 px-1 py-0.5 bg-gray-800 border border-gray-700 rounded text-[10px]
                   text-gray-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
    </label>
  )
}

function ParamInput({ name, value, onChange }: {
  name: string; value: number | boolean | string
  onChange: (v: number | boolean | string) => void
}) {
  if (typeof value === 'boolean') {
    return (
      <label className="flex items-center gap-1.5 text-[10px] text-gray-400">
        <input type="checkbox" checked={value}
          onChange={(e) => onChange(e.target.checked)}
          className="accent-blue-500" />
        {name}
      </label>
    )
  }
  if (typeof value === 'number') {
    return (
      <label className="flex flex-col gap-0.5 text-[9px] text-gray-500">
        <span className="uppercase tracking-wider">{name}</span>
        <input type="number" value={Number.isFinite(value) ? value : 0}
          step="any"
          onChange={(e) => {
            const v = Number(e.target.value)
            if (Number.isFinite(v)) onChange(v)
          }}
          className="px-1.5 py-1 bg-gray-800 border border-gray-700 rounded text-[10px]
                     text-gray-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
      </label>
    )
  }
  return (
    <label className="flex flex-col gap-0.5 text-[9px] text-gray-500">
      <span className="uppercase tracking-wider">{name}</span>
      <input type="text" value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        className="px-1.5 py-1 bg-gray-800 border border-gray-700 rounded text-[10px] text-gray-200" />
    </label>
  )
}

// ── Procedural Controller inspector (BL-50 follow-up polish) ───────────────
// Surfaces waveform / noise parameters as proper inputs so the user doesn't
// have to edit JSON. Section is HIDDEN when the controller is keyframe
// (default) — that case is the dope sheet / curve editor's job.

const WAVEFORM_SHAPES: WaveformShape[] = [
  'sine', 'cosine', 'square', 'triangle', 'sawtooth', 'reverseSawtooth',
]

function ControllerSection({
  controller, timelineId, trackTarget, editor,
}: {
  controller: TrackController | undefined
  timelineId: string
  trackTarget: string
  editor: EditorStateReturn
}) {
  // Hidden for default (keyframe) controller — keyframe path is edited
  // via the timeline directly.
  if (!controller || controller.type === 'keyframe') return null

  const dispatch = (next: TrackController) => {
    editor.dispatchCommand(makeSetTrackControllerCmd(timelineId, trackTarget, controller, next))
  }
  const revertToKeyframe = () => {
    editor.dispatchCommand(makeSetTrackControllerCmd(timelineId, trackTarget, controller, { type: 'keyframe' }))
  }

  return (
    <div className="border-b border-gray-800">
      <div className="flex items-center justify-between px-3 py-1 bg-fuchsia-950/30">
        <span className="text-[9px] uppercase tracking-wider text-fuchsia-300">
          ƒ Procedural · {controller.type}
        </span>
        <button
          onClick={revertToKeyframe}
          className="text-[10px] px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400"
          title="Convert back to keyframe controller (resets to track.keyframes)"
        >× Keyframe</button>
      </div>

      <div className="p-3 grid grid-cols-2 gap-2">
        {controller.type === 'waveform' && (() => {
          const wf = controller.waveform ?? DEFAULT_WAVEFORM_PARAMS
          const patch = (p: Partial<typeof wf>) => dispatch({
            type: 'waveform', waveform: { ...wf, ...p },
          })
          return (
            <>
              <label className="col-span-2 flex flex-col gap-0.5 text-[9px] text-gray-500">
                <span className="uppercase tracking-wider">Shape</span>
                <select value={wf.shape}
                  onChange={(e) => patch({ shape: e.target.value as WaveformShape })}
                  className="px-1.5 py-1 bg-gray-800 border border-gray-700 rounded text-[10px] text-gray-200">
                  {WAVEFORM_SHAPES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <NumField label="Amplitude" value={wf.amplitude} onChange={(v) => patch({ amplitude: v })} />
              <NumField label="Frequency (Hz)" value={wf.frequency} onChange={(v) => patch({ frequency: v })} />
              <NumField label="Phase (rad)" value={wf.phase} step={0.1} onChange={(v) => patch({ phase: v })} />
              <NumField label="Offset" value={wf.offset} onChange={(v) => patch({ offset: v })} />
              {wf.shape === 'square' && (
                <NumField label="Duty" value={wf.duty} step={0.05} min={0} max={1}
                  onChange={(v) => patch({ duty: v })} />
              )}
            </>
          )
        })()}
        {controller.type === 'noise' && (() => {
          const nz = controller.noise ?? DEFAULT_NOISE_PARAMS
          const patch = (p: Partial<typeof nz>) => dispatch({
            type: 'noise', noise: { ...nz, ...p },
          })
          return (
            <>
              <NumField label="Seed" value={nz.seed} step={1}
                onChange={(v) => patch({ seed: Math.round(v) })} />
              <NumField label="Frequency (Hz)" value={nz.frequency} onChange={(v) => patch({ frequency: v })} />
              <NumField label="Strength" value={nz.strength} onChange={(v) => patch({ strength: v })} />
              <NumField label="Offset" value={nz.offset} onChange={(v) => patch({ offset: v })} />
              <NumField label="Octaves" value={nz.octaves} step={1} min={1} max={8}
                onChange={(v) => patch({ octaves: Math.max(1, Math.min(8, Math.round(v))) })} />
              <NumField label="Lacunarity" value={nz.lacunarity} step={0.1}
                onChange={(v) => patch({ lacunarity: v })} />
              <NumField label="Gain" value={nz.gain} step={0.05} min={0} max={1}
                onChange={(v) => patch({ gain: v })} />
              <label className="flex items-center gap-1.5 text-[10px] text-gray-400 mt-1">
                <input type="checkbox" checked={nz.positiveOnly}
                  onChange={(e) => patch({ positiveOnly: e.target.checked })}
                  className="accent-blue-500" />
                positiveOnly
              </label>
            </>
          )
        })()}
      </div>
    </div>
  )
}

function NumField({ label, value, onChange, step = 'any', min, max }: {
  label: string; value: number
  onChange: (v: number) => void
  step?: number | 'any'
  min?: number; max?: number
}) {
  return (
    <label className="flex flex-col gap-0.5 text-[9px] text-gray-500">
      <span className="uppercase tracking-wider">{label}</span>
      <input type="number" value={Number.isFinite(value) ? value : 0}
        step={step} min={min} max={max}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v)) onChange(v)
        }}
        className="px-1.5 py-1 bg-gray-800 border border-gray-700 rounded text-[10px]
                   text-gray-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
    </label>
  )
}
