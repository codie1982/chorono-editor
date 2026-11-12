'use client'
import { CalculationNumberInput } from '@/components/inputs/CalculationNumberInput'
import { DocumentationHelp } from '@/components/help/DocumentationHelp'
// ── StateMachinePanel (BL-09 Sprint 3) ───────────────────────────────────────
// SVG node-graph editor for interactive state machines. Lives in the
// `canvas-leaf` dock tab next to the canvas (toggled by the toolbar sub-mod).
//
//   • States are draggable nodes; the initial state carries a ● marker.
//   • Transitions are bezier edges — solid for event-based, dashed for
//     guard-only — with a label showing the trigger or guard.
//   • Drag the ◦ handle on a node onto another node to create a transition.
//   • Selecting a node/edge opens an inline detail editor (right rail).
//   • Test Mode drives the live runtime: per-trigger dispatch buttons, the
//     active state lights up, and an in-flight blend shows a progress bar.

import { useState, useEffect, useRef, useCallback } from 'react'
import type {
  ChronoScene, StateMachineDefinition, ChronoSMState, BaseSMTransition, SMGuard,
} from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { InteractiveRuntimeReturn } from '@/app/hooks/useInteractiveRuntime'
import { newTimeline, newSMState, newSMTransition } from '@/lib/defaults'
import {
  makeCreateSMCmd, makeDeleteSMCmd,
  makeAddSMStateCmd, makeDeleteSMStateCmd, makeUpdateSMStateCmd, makeSetInitialStateCmd,
  makeAddSMTransitionCmd, makeDeleteSMTransitionCmd, makeUpdateSMTransitionCmd,
} from '@/lib/editor/commands-statemachine'
import { makeAddTimelineCmd } from '@/lib/editor/commands-timeline'
import {
  NODE_W, NODE_H, statePos, edgePath, edgeMidpoint, selfLoopPath, selfLoopLabel,
  hitNode, canvasBounds, type NodePos,
} from './statemachine/graphLayout'

interface Props {
  scene: ChronoScene
  editor: EditorStateReturn
  runtime: InteractiveRuntimeReturn
}

type Selection =
  | { kind: 'state'; id: string }
  | { kind: 'transition'; id: string }
  | null

const GUARD_OPS: SMGuard['op'][] = ['>', '<', '==', '!=']

export default function StateMachinePanel({ scene, editor, runtime }: Props) {
  const machines = scene.stateMachines ?? []
  const [selectedSMId, setSelectedSMId] = useState<string | null>(null)
  const sm = machines.find((m) => m.id === selectedSMId) ?? machines[0] ?? null

  // Keep the selected id valid as machines come and go.
  useEffect(() => {
    if (machines.length === 0) { if (selectedSMId !== null) setSelectedSMId(null); return }
    if (!machines.some((m) => m.id === selectedSMId)) setSelectedSMId(machines[0].id)
  }, [machines, selectedSMId])

  return (
    <div className="flex flex-col h-full text-xs text-gray-300 bg-gray-900">
      <Header
        machines={machines}
        sm={sm}
        editor={editor}
        onSelectSM={setSelectedSMId}
      />
      {!sm ? (
        <div className="flex-1 flex items-center justify-center p-4 text-center text-[11px] text-gray-500">
          No state machines yet. Create one to drive interactive transitions
          between timelines (idle → hover → pressed …).
        </div>
      ) : (
        <Editor key={sm.id} sm={sm} scene={scene} editor={editor} runtime={runtime} />
      )}
    </div>
  )
}

// ── Header / machine bar ──────────────────────────────────────────────────────

function Header({
  machines, sm, editor, onSelectSM,
}: {
  machines: StateMachineDefinition[]
  sm: StateMachineDefinition | null
  editor: EditorStateReturn
  onSelectSM: (id: string) => void
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-700 shrink-0">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">SM</span>
      {machines.length > 0 && (
        <select
          value={sm?.id ?? ''}
          onChange={(e) => onSelectSM(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200 max-w-[160px]"
        >
          {machines.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      )}
      <div className="ml-auto flex items-center gap-1">
        <DocumentationHelp topic="editor/state-machines" compact />
        <button
          onClick={() => editor.dispatchCommand(makeCreateSMCmd())}
          className="px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
        >
          + Machine
        </button>
        {sm && (
          <button
            onClick={() => editor.dispatchCommand(makeDeleteSMCmd(sm))}
            className="px-2 py-0.5 rounded bg-red-900/60 hover:bg-red-800 text-red-200"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  )
}

// ── Editor (graph + detail + test) ────────────────────────────────────────────

function Editor({
  sm, scene, editor, runtime,
}: {
  sm: StateMachineDefinition
  scene: ChronoScene
  editor: EditorStateReturn
  runtime: InteractiveRuntimeReturn
}) {
  const [selection, setSelection] = useState<Selection>(null)
  const [testMode, setTestMode] = useState(false)

  // Live drag/connect state.
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null)
  const [connect, setConnect] = useState<{ from: string; cursor: NodePos } | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)

  // Activate the runtime's per-frame test tick while test mode is on.
  const { setSMTestActive } = runtime
  useEffect(() => {
    setSMTestActive(testMode)
    return () => setSMTestActive(false)
  }, [testMode, setSMTestActive])

  const states = sm.states
  const posOf = useCallback(
    (i: number): NodePos =>
      dragPos && dragPos.id === states[i].id
        ? { x: dragPos.x, y: dragPos.y }
        : statePos(states[i], i),
    [dragPos, states],
  )
  const posById = (id: string): NodePos => {
    const i = states.findIndex((s) => s.id === id)
    return i < 0 ? { x: 0, y: 0 } : posOf(i)
  }

  const toSvg = (clientX: number, clientY: number): NodePos => {
    const r = svgRef.current?.getBoundingClientRect()
    return { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) }
  }

  // ── Node move ───────────────────────────────────────────────────────────────
  const beginNodeDrag = (e: React.PointerEvent, state: ChronoSMState, idx: number) => {
    e.stopPropagation()
    setSelection({ kind: 'state', id: state.id })
    const center = posOf(idx)
    const start = toSvg(e.clientX, e.clientY)
    const off = { x: start.x - center.x, y: start.y - center.y }
    let last = center
    let moved = false
    const move = (ev: PointerEvent) => {
      const p = toSvg(ev.clientX, ev.clientY)
      last = { x: Math.round(p.x - off.x), y: Math.round(p.y - off.y) }
      moved = true
      setDragPos({ id: state.id, ...last })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDragPos(null)
      if (moved) editor.dispatchCommand(makeUpdateSMStateCmd(sm.id, state.id, { x: last.x, y: last.y }))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // ── Drag-to-connect ───────────────────────────────────────────────────────────
  const beginConnect = (e: React.PointerEvent, fromId: string) => {
    e.stopPropagation()
    setConnect({ from: fromId, cursor: toSvg(e.clientX, e.clientY) })
    const move = (ev: PointerEvent) => setConnect({ from: fromId, cursor: toSvg(ev.clientX, ev.clientY) })
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const p = toSvg(ev.clientX, ev.clientY)
      const targetIdx = states.findIndex((_, i) => hitNode(posOf(i), p.x, p.y))
      setConnect(null)
      if (targetIdx >= 0) {
        const to = states[targetIdx].id
        editor.dispatchCommand(makeAddSMTransitionCmd(sm.id, newSMTransition(fromId, to)))
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const handleAddState = () => {
    const tl = newTimeline()
    editor.dispatchCommand(makeAddTimelineCmd(tl))
    editor.dispatchCommand(makeAddSMStateCmd(sm.id, newSMState(tl.id, `state ${states.length + 1}`)))
  }

  // Live runtime introspection for test mode.
  const rt = runtime.smRuntimes.get(sm.id)
  const activeStateId = testMode ? rt?.currentStateId : undefined
  const blend = testMode ? rt?.peekBlend(performance.now()) ?? null : null

  const positions = states.map((_, i) => posOf(i))
  const bounds = canvasBounds(positions)

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Graph toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-1 border-b border-gray-800 shrink-0">
        <button onClick={handleAddState} className="px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600">+ State</button>
        <span className="text-[10px] text-gray-600">drag ◦ handle → connect</span>
        <label className="ml-auto flex items-center gap-1 cursor-pointer select-none">
          <input type="checkbox" checked={testMode} onChange={(e) => setTestMode(e.target.checked)} />
          <span className={testMode ? 'text-emerald-400' : 'text-gray-400'}>Test Mode</span>
        </label>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Graph canvas */}
        <div className="flex-1 overflow-auto bg-gray-950/40">
          <svg
            ref={svgRef}
            width={bounds.width}
            height={bounds.height}
            onPointerDown={() => setSelection(null)}
            className="block"
          >
            <defs>
              <marker id="sm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" className="fill-gray-500" />
              </marker>
              <marker id="sm-arrow-sel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" className="fill-blue-400" />
              </marker>
            </defs>

            {/* Edges */}
            {sm.transitions.map((t) => (
              <TransitionEdge
                key={t.id}
                t={t}
                from={posById(t.from === '*' ? sm.initialStateId : t.from)}
                to={posById(t.to)}
                selfLoop={t.from === t.to}
                selected={selection?.kind === 'transition' && selection.id === t.id}
                onSelect={() => setSelection({ kind: 'transition', id: t.id })}
              />
            ))}

            {/* Pending connect line */}
            {connect && (
              <line
                x1={posById(connect.from).x} y1={posById(connect.from).y}
                x2={connect.cursor.x} y2={connect.cursor.y}
                className="stroke-blue-400" strokeWidth={1.5} strokeDasharray="4 3"
              />
            )}

            {/* Nodes */}
            {states.map((s, i) => (
              <StateNode
                key={s.id}
                state={s}
                pos={posOf(i)}
                isInitial={s.id === sm.initialStateId}
                isActive={s.id === activeStateId}
                selected={selection?.kind === 'state' && selection.id === s.id}
                timelineMissing={!scene.timelines.some((tl) => tl.id === s.timelineId)}
                onPointerDownBody={(e) => beginNodeDrag(e, s, i)}
                onPointerDownHandle={(e) => beginConnect(e, s.id)}
              />
            ))}
          </svg>
        </div>

        {/* Detail rail */}
        {selection && (
          <aside className="w-60 shrink-0 border-l border-gray-800 overflow-y-auto">
            {selection.kind === 'state' ? (
              <StateDetail
                sm={sm} scene={scene} editor={editor}
                state={states.find((s) => s.id === selection.id) ?? null}
                onDeleted={() => setSelection(null)}
              />
            ) : (
              <TransitionDetail
                sm={sm} editor={editor}
                transition={sm.transitions.find((t) => t.id === selection.id) ?? null}
                onDeleted={() => setSelection(null)}
              />
            )}
          </aside>
        )}
      </div>

      {/* Test bar */}
      {testMode && (
        <TestBar sm={sm} runtime={runtime} activeStateId={activeStateId} blend={blend} />
      )}
    </div>
  )
}

// ── SVG node ──────────────────────────────────────────────────────────────────

function StateNode({
  state, pos, isInitial, isActive, selected, timelineMissing,
  onPointerDownBody, onPointerDownHandle,
}: {
  state: ChronoSMState
  pos: NodePos
  isInitial: boolean
  isActive: boolean
  selected: boolean
  timelineMissing: boolean
  onPointerDownBody: (e: React.PointerEvent) => void
  onPointerDownHandle: (e: React.PointerEvent) => void
}) {
  const x = pos.x - NODE_W / 2
  const y = pos.y - NODE_H / 2
  const stroke = isActive ? 'stroke-emerald-400' : selected ? 'stroke-blue-400' : 'stroke-gray-600'
  const fill = isActive ? 'fill-emerald-950' : 'fill-gray-800'
  return (
    <g className="cursor-move" onPointerDown={onPointerDownBody}>
      <rect
        x={x} y={y} width={NODE_W} height={NODE_H} rx={8}
        className={`${fill} ${stroke}`} strokeWidth={selected || isActive ? 2 : 1.25}
      />
      {isInitial && (
        <circle cx={x + 12} cy={y + 12} r={4} className="fill-amber-400">
          <title>Initial state</title>
        </circle>
      )}
      <text x={pos.x} y={pos.y - 4} textAnchor="middle" className="fill-gray-100 text-[12px] font-medium select-none">
        {state.name}
      </text>
      <text x={pos.x} y={pos.y + 12} textAnchor="middle" className={`text-[10px] select-none ${timelineMissing ? 'fill-red-400' : 'fill-gray-500'}`}>
        {timelineMissing ? `${state.timelineId} (missing)` : state.timelineId}
      </text>
      {/* connect handle */}
      <circle
        cx={x + NODE_W} cy={pos.y} r={6}
        className="fill-gray-700 stroke-gray-500 hover:fill-blue-500 cursor-crosshair"
        strokeWidth={1}
        onPointerDown={onPointerDownHandle}
      >
        <title>Drag to another state to create a transition</title>
      </circle>
    </g>
  )
}

// ── SVG edge ──────────────────────────────────────────────────────────────────

function TransitionEdge({
  t, from, to, selfLoop, selected, onSelect,
}: {
  t: BaseSMTransition
  from: NodePos
  to: NodePos
  selfLoop: boolean
  selected: boolean
  onSelect: () => void
}) {
  const guardOnly = !t.trigger
  const d = selfLoop ? selfLoopPath(to) : edgePath(from, to)
  const mid = selfLoop ? selfLoopLabel(to) : edgeMidpoint(from, to)
  const label = t.trigger
    ? (t.guard ? `${t.trigger} · [${t.guard.param}${t.guard.op}${t.guard.value}]` : t.trigger)
    : t.guard ? `[${t.guard.param}${t.guard.op}${t.guard.value}]` : '—'
  const stroke = selected ? 'stroke-blue-400' : 'stroke-gray-500'
  return (
    <g className="cursor-pointer" onPointerDown={(e) => { e.stopPropagation(); onSelect() }}>
      {/* fat invisible hit area */}
      <path d={d} className="stroke-transparent fill-none" strokeWidth={12} />
      <path
        d={d}
        className={`${stroke} fill-none`}
        strokeWidth={selected ? 2 : 1.5}
        strokeDasharray={guardOnly ? '5 4' : undefined}
        markerEnd={`url(#${selected ? 'sm-arrow-sel' : 'sm-arrow'})`}
      />
      <text
        x={mid.x} y={mid.y - 4} textAnchor="middle"
        className={`text-[10px] select-none ${selected ? 'fill-blue-300' : 'fill-gray-400'}`}
      >
        {label}
      </text>
    </g>
  )
}

// ── State detail editor ─────────────────────────────────────────────────────────

function StateDetail({
  sm, scene, editor, state, onDeleted,
}: {
  sm: StateMachineDefinition
  scene: ChronoScene
  editor: EditorStateReturn
  state: ChronoSMState | null
  onDeleted: () => void
}) {
  if (!state) return null
  const update = (patch: Partial<Omit<ChronoSMState, 'id'>>) =>
    editor.dispatchCommand(makeUpdateSMStateCmd(sm.id, state.id, patch))
  return (
    <div className="p-3 space-y-2.5">
      <div className="text-[10px] uppercase tracking-wider text-gray-500">State</div>
      <Field label="Name">
        <input
          value={state.name}
          onChange={(e) => update({ name: e.target.value })}
          className="w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200"
        />
      </Field>
      <Field label="Timeline">
        <select
          value={state.timelineId}
          onChange={(e) => update({ timelineId: e.target.value })}
          className="w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200"
        >
          {scene.timelines.map((tl) => (
            <option key={tl.id} value={tl.id}>{tl.id}</option>
          ))}
        </select>
      </Field>
      <Field label="Speed">
        <CalculationNumberInput aria-label="state speed 1" step={0.1}
          value={state.speed ?? 1}
          onChange={(e) => update({ speed: Number(e.target.value) })}
          className="w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200" onCalculate={calculated => update({ speed: calculated })} />
      </Field>
      <div className="flex gap-1 pt-1">
        <button
          disabled={state.id === sm.initialStateId}
          onClick={() => editor.dispatchCommand(makeSetInitialStateCmd(sm.id, state.id))}
          className="flex-1 px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-[11px]"
        >
          {state.id === sm.initialStateId ? '★ Initial' : 'Set initial'}
        </button>
        <button
          onClick={() => { editor.dispatchCommand(makeDeleteSMStateCmd(sm.id, state.id)); onDeleted() }}
          className="px-2 py-1 rounded bg-red-900/60 hover:bg-red-800 text-red-200 text-[11px]"
        >
          Delete
        </button>
      </div>
    </div>
  )
}

// ── Transition detail editor ─────────────────────────────────────────────────────

function TransitionDetail({
  sm, editor, transition, onDeleted,
}: {
  sm: StateMachineDefinition
  editor: EditorStateReturn
  transition: BaseSMTransition | null
  onDeleted: () => void
}) {
  if (!transition) return null
  const t = transition
  const nameOf = (id: string) => id === '*' ? '∗ (any)' : (sm.states.find((s) => s.id === id)?.name ?? id)
  const update = (patch: Partial<Omit<BaseSMTransition, 'id'>>) =>
    editor.dispatchCommand(makeUpdateSMTransitionCmd(sm.id, t.id, patch))

  const guard = t.guard
  const setGuard = (patch: Partial<SMGuard>) => {
    const base: SMGuard = guard ?? { param: '', op: '>', value: 0 }
    update({ guard: { ...base, ...patch } })
  }

  return (
    <div className="p-3 space-y-2.5">
      <div className="text-[10px] uppercase tracking-wider text-gray-500">Transition</div>
      <div className="text-[11px] text-gray-300">
        {nameOf(t.from)} <span className="text-gray-600">→</span> {nameOf(t.to)}
      </div>
      <Field label="Trigger (event)">
        <input
          value={t.trigger ?? ''}
          placeholder="— guard-only —"
          onChange={(e) => update({ trigger: e.target.value || undefined })}
          className="w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200"
        />
      </Field>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-gray-400">Guard</span>
        {guard ? (
          <button onClick={() => update({ guard: undefined })} className="text-[10px] text-gray-500 hover:text-red-400">remove</button>
        ) : (
          <button onClick={() => setGuard({})} className="text-[10px] text-gray-500 hover:text-gray-300">+ add</button>
        )}
      </div>
      {guard && (
        <div className="flex gap-1">
          <input
            value={guard.param} placeholder="param"
            onChange={(e) => setGuard({ param: e.target.value })}
            className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200"
          />
          <select
            value={guard.op}
            onChange={(e) => setGuard({ op: e.target.value as SMGuard['op'] })}
            className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-gray-200"
          >
            {GUARD_OPS.map((op) => <option key={op} value={op}>{op}</option>)}
          </select>
          <input
            value={String(guard.value)}
            onChange={(e) => {
              const raw = e.target.value
              const n = Number(raw)
              setGuard({ value: raw !== '' && !Number.isNaN(n) ? n : raw })
            }}
            className="w-14 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200"
          />
        </div>
      )}

      <Field label="Blend (ms)">
        <CalculationNumberInput aria-label="t blend Ms 0" min={0} step={50}
          value={t.blendMs ?? 0}
          onChange={(e) => update({ blendMs: Number(e.target.value) || undefined })}
          className="w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200" onCalculate={calculated => update({ blendMs: calculated || undefined })} />
      </Field>
      <Field label="Priority">
        <CalculationNumberInput aria-label="t priority 0" step={1}
          value={t.priority ?? 0}
          onChange={(e) => update({ priority: Number(e.target.value) || undefined })}
          className="w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200" onCalculate={calculated => update({ priority: calculated || undefined })} />
      </Field>

      <button
        onClick={() => { editor.dispatchCommand(makeDeleteSMTransitionCmd(sm.id, t.id)); onDeleted() }}
        className="w-full px-2 py-1 rounded bg-red-900/60 hover:bg-red-800 text-red-200 text-[11px]"
      >
        Delete transition
      </button>
    </div>
  )
}

// ── Test bar ──────────────────────────────────────────────────────────────────

function TestBar({
  sm, runtime, activeStateId, blend,
}: {
  sm: StateMachineDefinition
  runtime: InteractiveRuntimeReturn
  activeStateId: string | undefined
  blend: { alpha: number } | null
}) {
  // Unique, non-empty triggers across the machine.
  const triggers = Array.from(new Set(sm.transitions.map((t) => t.trigger).filter((x): x is string => !!x)))
  const activeName = sm.states.find((s) => s.id === activeStateId)?.name ?? '—'
  return (
    <div className="border-t border-gray-700 px-3 py-1.5 space-y-1.5 shrink-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-gray-400">Active: <span className="text-emerald-400">{activeName}</span></span>
        <div className="flex gap-1 flex-wrap">
          {triggers.length === 0 && <span className="text-[10px] text-gray-600 italic">no event triggers</span>}
          {triggers.map((tr) => (
            <button
              key={tr}
              onClick={() => runtime.dispatchSMEvent(tr, sm.id)}
              className="px-2 py-0.5 rounded bg-gray-700 hover:bg-blue-700 text-[11px]"
            >
              {tr}
            </button>
          ))}
        </div>
        <button
          onClick={() => runtime.smRuntimes.get(sm.id)?.reset()}
          className="ml-auto px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-[11px] text-gray-400"
        >
          Reset
        </button>
      </div>
      {blend && (
        <div className="h-1 rounded bg-gray-800 overflow-hidden">
          <div className="h-full bg-emerald-500" style={{ width: `${Math.round(blend.alpha * 100)}%` }} />
        </div>
      )}
    </div>
  )
}

// ── Small field wrapper ───────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] text-gray-500 mb-0.5">{label}</span>
      {children}
    </label>
  )
}
