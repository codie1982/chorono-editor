'use client'
// ── StateMachinePanel (BL-09) ────────────────────────────────────────────────
// Editor surface for interactive state machines. Lives in the `canvas-leaf`
// dock tab alongside the canvas — toggling the toolbar sub-mod swaps between
// them via dispatchTab('canvas-leaf', 'canvas' | 'stateMachine').
//
// Sprint 1 scaffold: machine list + state/transition lists wired to the
// undoable SM commands. The SVG node graph (drag-to-connect states, blend
// editing) lands in Sprint 3 — the placeholder marks where it mounts.

import { useState } from 'react'
import type { ChronoScene, StateMachineDefinition } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { newTimeline, newSMState } from '@/lib/defaults'
import {
  makeCreateSMCmd, makeDeleteSMCmd,
  makeAddSMStateCmd, makeDeleteSMStateCmd, makeSetInitialStateCmd,
} from '@/lib/editor/commands-statemachine'
import { makeAddTimelineCmd } from '@/lib/editor/commands-timeline'

interface Props {
  scene: ChronoScene
  editor: EditorStateReturn
}

export default function StateMachinePanel({ scene, editor }: Props) {
  const machines = scene.stateMachines ?? []
  const [selectedSMId, setSelectedSMId] = useState<string | null>(machines[0]?.id ?? null)

  const selected = machines.find((m) => m.id === selectedSMId) ?? machines[0] ?? null

  return (
    <div className="flex flex-col h-full text-xs text-gray-300 bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          State Machine
        </span>
        <button
          onClick={() => editor.dispatchCommand(makeCreateSMCmd())}
          className="text-[11px] px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
        >
          + Machine
        </button>
      </div>

      {machines.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-4 text-center text-[11px] text-gray-500">
          No state machines yet. Create one to drive interactive transitions
          between timelines (idle → hover → pressed …).
        </div>
      )}

      {machines.length > 0 && (
        <div className="flex flex-1 min-h-0">
          {/* Left rail: machine list */}
          <div className="w-32 shrink-0 border-r border-gray-700 overflow-y-auto">
            {machines.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedSMId(m.id)}
                className={`block w-full text-left px-2 py-1.5 truncate border-b border-gray-800 ${
                  m.id === selected?.id ? 'bg-gray-800 text-gray-100' : 'hover:bg-gray-800/50'
                }`}
              >
                {m.name}
              </button>
            ))}
          </div>

          {/* Right: selected machine detail */}
          {selected && (
            <MachineDetail sm={selected} scene={scene} editor={editor} />
          )}
        </div>
      )}
    </div>
  )
}

// ── Detail view for one machine ──────────────────────────────────────────────

function MachineDetail({
  sm, scene, editor,
}: {
  sm: StateMachineDefinition
  scene: ChronoScene
  editor: EditorStateReturn
}) {
  function handleAddState() {
    // A new state needs a backing timeline — create both.
    const tl = newTimeline()
    editor.dispatchCommand(makeAddTimelineCmd(tl))
    editor.dispatchCommand(makeAddSMStateCmd(sm.id, newSMState(tl.id, `state ${sm.states.length + 1}`)))
  }

  return (
    <div className="flex flex-col flex-1 min-w-0">
      {/* Machine actions */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-800">
        <span className="truncate text-gray-200">{sm.name}</span>
        <div className="flex gap-1">
          <button
            onClick={handleAddState}
            className="text-[11px] px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600"
          >
            + State
          </button>
          <button
            onClick={() => editor.dispatchCommand(makeDeleteSMCmd(sm))}
            className="text-[11px] px-2 py-0.5 rounded bg-red-900/60 hover:bg-red-800 text-red-200"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Placeholder for the Sprint 3 SVG node graph */}
      <div className="flex items-center justify-center h-24 border-b border-gray-800 text-[10px] text-gray-600 italic">
        node graph — Sprint 3
      </div>

      {/* States */}
      <div className="overflow-y-auto flex-1">
        <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-gray-500">States</div>
        {sm.states.map((st) => {
          const tlExists = scene.timelines.some((t) => t.id === st.timelineId)
          const isInitial = st.id === sm.initialStateId
          return (
            <div
              key={st.id}
              className="flex items-center justify-between px-3 py-1 border-b border-gray-800/60"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <button
                  title={isInitial ? 'Initial state' : 'Set as initial state'}
                  onClick={() => editor.dispatchCommand(makeSetInitialStateCmd(sm.id, st.id))}
                  className={isInitial ? 'text-amber-400' : 'text-gray-600 hover:text-gray-400'}
                >
                  ●
                </button>
                <span className="truncate text-gray-200">{st.name}</span>
                <span className={`truncate text-[10px] ${tlExists ? 'text-gray-500' : 'text-red-400'}`}>
                  {tlExists ? st.timelineId : `${st.timelineId} (missing)`}
                </span>
              </div>
              <button
                onClick={() => editor.dispatchCommand(makeDeleteSMStateCmd(sm.id, st.id))}
                className="text-[11px] text-gray-600 hover:text-red-400 shrink-0"
              >
                ✕
              </button>
            </div>
          )
        })}

        {/* Transitions */}
        <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-gray-500">Transitions</div>
        {sm.transitions.length === 0 && (
          <div className="px-3 py-1 text-[10px] text-gray-600 italic">
            No transitions yet.
          </div>
        )}
        {sm.transitions.map((tr) => {
          const fromName = tr.from === '*' ? '∗ (any)' : (sm.states.find((s) => s.id === tr.from)?.name ?? tr.from)
          const toName = sm.states.find((s) => s.id === tr.to)?.name ?? tr.to
          return (
            <div key={tr.id} className="px-3 py-1 border-b border-gray-800/60 text-[11px]">
              <span className="text-gray-300">{fromName}</span>
              <span className="text-gray-600"> → </span>
              <span className="text-gray-300">{toName}</span>
              <span className="text-gray-500 ml-1.5">
                {tr.trigger ? `on "${tr.trigger}"` : '— guard —'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
