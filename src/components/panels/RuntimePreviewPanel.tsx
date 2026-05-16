'use client'
// ── RuntimePreviewPanel ───────────────────────────────────────────────────────
// Builder-side interactive preview. Lets the author exercise the runtime
// without leaving Chorono:
//
//   – Parameters: slider / toggle / text / colour input that overrides
//     defaultValue at runtime (does NOT touch the scene tree / history).
//   – Custom events: fire any event referenced by a customEvent trigger.
//   – Segments: list every segment across all timelines with Play / Stop.
//
// All actions go through the shared `useInteractiveRuntime` hook so the
// rendered canvas reflects them on the very next frame.

import { useMemo, useState } from 'react'
import type { ChronoScene, SceneParameterValue, SceneParameter } from '@/lib/types'
import type { InteractiveRuntimeReturn } from '@/app/hooks/useInteractiveRuntime'

interface Props {
  scene:   ChronoScene
  runtime: InteractiveRuntimeReturn
}

export default function RuntimePreviewPanel({ scene, runtime }: Props) {
  const customEventNames = useMemo(() => {
    const set = new Set<string>()
    for (const t of scene.triggers) {
      if (t.event.type === 'customEvent' && t.event.refId) set.add(t.event.refId)
    }
    return Array.from(set)
  }, [scene.triggers])

  const segments = useMemo(() => scene.timelines.flatMap((tl) =>
    (tl.segments ?? []).map((s) => ({ ...s, timelineId: tl.id })),
  ), [scene.timelines])

  return (
    <div className="flex flex-col h-full text-xs text-gray-300">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          Runtime Preview
        </span>
        <button
          onClick={runtime.resetParams}
          className="text-[10px] text-gray-400 hover:text-gray-200"
          title="Reset all parameter overrides"
        >
          Reset all
        </button>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-gray-800">
        {/* ── Parameters ───────────────────────────────────────────────── */}
        <Section title="Parameters" empty="No parameters defined. Add them in the Parameters panel.">
          {scene.parameters.length > 0 && scene.parameters.map((p) => (
            <ParamControl key={p.id} param={p} runtime={runtime} />
          ))}
        </Section>

        {/* ── Custom events ────────────────────────────────────────────── */}
        <Section title="Custom Events" empty="Add a customEvent trigger first to wire up an event name.">
          {customEventNames.length > 0 && (
            <div className="flex flex-wrap gap-1.5 p-2">
              {customEventNames.map((name) => (
                <button
                  key={name}
                  onClick={() => runtime.fireEvent({ type: 'customEvent', refId: name })}
                  className="text-[11px] px-2 py-1 rounded bg-amber-900/50 hover:bg-amber-800 text-amber-200 font-mono"
                >
                  ▶ {name}
                </button>
              ))}
            </div>
          )}
        </Section>

        {/* ── Segments ─────────────────────────────────────────────────── */}
        <Section title="Segments" empty="No segments defined yet. Add segments in the timeline.">
          {segments.length > 0 && (
            <div className="space-y-1 p-2">
              {segments.map((s) => {
                const active = runtime.segmentState?.segmentId === s.id
                return (
                  <div
                    key={s.id}
                    className={`flex items-center justify-between gap-2 px-2 py-1 rounded ${
                      active ? 'bg-emerald-900/30' : 'bg-gray-800/30 hover:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2 h-2 rounded-sm shrink-0"
                        style={{ background: s.color ?? '#22D3EE' }}
                      />
                      <span className="truncate text-[11px] text-gray-200">{s.name}</span>
                      <span className="text-[9px] text-gray-500 font-mono shrink-0">
                        {s.startMs}–{s.endMs}ms
                      </span>
                    </div>
                    {active ? (
                      <button
                        onClick={runtime.stopSegment}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-rose-900 hover:bg-rose-800 text-rose-200"
                      >
                        ■ Stop
                      </button>
                    ) : (
                      <div className="flex gap-1">
                        <button
                          onClick={() => runtime.playSegment(s.timelineId, s.id, false)}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900 hover:bg-emerald-800 text-emerald-200"
                          title="Play once"
                        >
                          ▶
                        </button>
                        <button
                          onClick={() => runtime.playSegment(s.timelineId, s.id, true)}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900 hover:bg-emerald-800 text-emerald-200"
                          title="Loop"
                        >
                          ↻
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section helper
// ─────────────────────────────────────────────────────────────────────────────

function Section({
  title, empty, children,
}: {
  title: string
  empty:  string
  children?: React.ReactNode
}) {
  const isEmpty = !children || (Array.isArray(children) && children.flat().every((c) => !c))
  return (
    <div className="py-1">
      <div className="px-3 py-1 text-[9px] uppercase tracking-wider text-gray-500 font-semibold">
        {title}
      </div>
      {isEmpty ? (
        <div className="px-3 pb-2 text-[10px] text-gray-600 italic">{empty}</div>
      ) : children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-parameter control
// ─────────────────────────────────────────────────────────────────────────────

function ParamControl({ param, runtime }: { param: SceneParameter; runtime: InteractiveRuntimeReturn }) {
  const liveValue = runtime.paramValues.get(param.id) ?? param.defaultValue

  function set(v: SceneParameterValue) {
    runtime.setParamOverride(param.id, v)
  }

  switch (param.type) {
    case 'number': {
      const min = param.min ?? 0
      const max = param.max ?? 100
      const n = typeof liveValue === 'number' ? liveValue : Number(liveValue) || 0
      return (
        <ParamRow param={param}>
          <input
            type="range"
            min={min}
            max={max}
            step={(max - min) / 1000 || 1}
            value={n}
            onChange={(e) => set(Number(e.target.value))}
            className="flex-1"
          />
          <input
            type="number"
            value={n}
            onChange={(e) => set(Number(e.target.value))}
            className="w-16 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-[11px] text-gray-100 outline-none"
          />
        </ParamRow>
      )
    }
    case 'boolean':
      return (
        <ParamRow param={param}>
          <label className="flex items-center gap-2 text-[11px] text-gray-200 cursor-pointer">
            <input type="checkbox" checked={Boolean(liveValue)} onChange={(e) => set(e.target.checked)} />
            {liveValue ? 'true' : 'false'}
          </label>
        </ParamRow>
      )
    case 'color':
      return (
        <ParamRow param={param}>
          <input
            type="color"
            value={String(liveValue ?? '#000000')}
            onChange={(e) => set(e.target.value)}
            className="w-7 h-6 rounded border border-gray-700 bg-transparent cursor-pointer"
          />
          <input
            value={String(liveValue ?? '#000000')}
            onChange={(e) => set(e.target.value)}
            className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-100 outline-none font-mono"
          />
        </ParamRow>
      )
    case 'string':
    case 'image':
    default:
      return (
        <ParamRow param={param}>
          <input
            value={String(liveValue ?? '')}
            onChange={(e) => set(e.target.value)}
            className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-100 outline-none"
          />
        </ParamRow>
      )
  }
}

function ParamRow({ param, children }: { param: SceneParameter; children: React.ReactNode }) {
  return (
    <div className="px-3 py-1.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-gray-200">{param.name}</span>
        <span className="text-[9px] text-gray-500 font-mono">{param.type}</span>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}
