'use client'
// ── ParametersPanel ───────────────────────────────────────────────────────────
// CRUD UI for ChronoScene.parameters. Each row is editable inline; changes
// dispatch EditorCommands so they participate in undo/redo.
//
// Use case: author defines a parameter ("name", default "Guest"), then binds
// it to a text layer's content via "{name}" placeholder OR to any animated
// property via the binding icon in PropertiesPanel. At runtime the host
// calls choronoView.setParam("name", "Engin") to drive the animation.

import { useState } from 'react'
import type {
  ChronoScene, SceneParameter, SceneParameterType, SceneParameterValue,
} from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { newSceneParameter } from '@/lib/defaults'
import {
  makeAddParamCmd, makeDeleteParamCmd, makeUpdateParamCmd,
} from '@/lib/editor/commands-interactive'

interface Props {
  scene: ChronoScene
  editor: EditorStateReturn
}

const PARAM_TYPES: SceneParameterType[] = ['string', 'number', 'boolean', 'color', 'image']
const TYPE_BADGES: Record<SceneParameterType, { bg: string; fg: string }> = {
  string:  { bg: 'bg-sky-900',     fg: 'text-sky-300'     },
  number:  { bg: 'bg-emerald-900', fg: 'text-emerald-300' },
  boolean: { bg: 'bg-amber-900',   fg: 'text-amber-300'   },
  color:   { bg: 'bg-pink-900',    fg: 'text-pink-300'    },
  image:   { bg: 'bg-violet-900',  fg: 'text-violet-300'  },
}

export default function ParametersPanel({ scene, editor }: Props) {
  const [addOpen, setAddOpen] = useState(false)

  function addParam(type: SceneParameterType) {
    editor.dispatchCommand(makeAddParamCmd(newSceneParameter(type)))
    setAddOpen(false)
  }

  return (
    <div className="flex flex-col h-full text-xs text-gray-300">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          Parameters
        </span>
        <div className="relative">
          <button
            onClick={() => setAddOpen((v) => !v)}
            className="text-[11px] px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
          >
            + Add
          </button>
          {addOpen && (
            <div className="absolute right-0 mt-1 z-20 bg-gray-800 border border-gray-600 rounded shadow-lg min-w-[120px]">
              {PARAM_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => addParam(t)}
                  className="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-[11px] capitalize"
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {scene.parameters.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-4 text-center text-[11px] text-gray-500">
          No parameters yet. Add one to expose runtime-tunable values
          (text, colour, size…) to your Android / iOS / Web host.
        </div>
      )}

      {/* ── Parameter rows ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {scene.parameters.map((p) => (
          <ParameterRow key={p.id} param={p} editor={editor} />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Single row
// ─────────────────────────────────────────────────────────────────────────────

function ParameterRow({ param, editor }: { param: SceneParameter; editor: EditorStateReturn }) {
  const [name, setName]         = useState(param.name)
  const [value, setValue]       = useState<SceneParameterValue>(param.defaultValue)
  const badge = TYPE_BADGES[param.type]

  // Commit the patched param. Captures `param` as `prev` so undo restores cleanly.
  function commit(patch: Partial<SceneParameter>) {
    const next: SceneParameter = { ...param, ...patch }
    if (JSON.stringify(next) === JSON.stringify(param)) return
    editor.dispatchCommand(makeUpdateParamCmd(param.id, param, next))
  }

  return (
    <div className="px-3 py-2 border-b border-gray-800 hover:bg-gray-800/40">
      <div className="flex items-center gap-2">
        <span className={`text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded ${badge.bg} ${badge.fg}`}>
          {param.type}
        </span>
        <input
          className="flex-1 bg-transparent border-b border-transparent focus:border-gray-500 outline-none text-[12px] text-gray-100"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== param.name && commit({ name })}
          placeholder="paramName"
        />
        <button
          onClick={() => editor.dispatchCommand(makeDeleteParamCmd(param))}
          className="text-[10px] text-red-400 hover:text-red-300"
          title="Delete parameter"
        >
          ✕
        </button>
      </div>

      <div className="mt-1.5 flex items-center gap-2">
        <span className="text-[10px] text-gray-500 w-14 shrink-0">Default</span>
        <ParamValueInput
          param={param}
          value={value}
          onChange={(v) => setValue(v)}
          onCommit={(v) => commit({ defaultValue: v })}
        />
      </div>

      {param.type === 'number' && (
        <div className="mt-1 flex items-center gap-2">
          <span className="text-[10px] text-gray-500 w-14 shrink-0">Range</span>
          <NumberInput
            value={param.min ?? 0}
            onCommit={(v) => commit({ min: v })}
            placeholder="min"
          />
          <span className="text-gray-600">→</span>
          <NumberInput
            value={param.max ?? 100}
            onCommit={(v) => commit({ max: v })}
            placeholder="max"
          />
        </div>
      )}

      <div className="mt-0.5 text-[9px] text-gray-500 font-mono">
        id: {param.id} · placeholder: {'{' + param.id + '}'}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Value inputs
// ─────────────────────────────────────────────────────────────────────────────

function ParamValueInput({
  param, value, onChange, onCommit,
}: {
  param: SceneParameter
  value: SceneParameterValue
  onChange: (v: SceneParameterValue) => void
  onCommit: (v: SceneParameterValue) => void
}) {
  switch (param.type) {
    case 'string':
    case 'image':
      return (
        <input
          className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-100 outline-none focus:border-gray-500"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onCommit(e.target.value)}
        />
      )
    case 'number':
      return (
        <input
          type="number"
          className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-100 outline-none focus:border-gray-500"
          value={Number(value ?? 0)}
          onChange={(e) => onChange(Number(e.target.value))}
          onBlur={(e) => onCommit(Number(e.target.value))}
        />
      )
    case 'boolean':
      return (
        <label className="flex items-center gap-2 text-[11px] text-gray-200">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => { onChange(e.target.checked); onCommit(e.target.checked) }}
          />
          {value ? 'true' : 'false'}
        </label>
      )
    case 'color':
      return (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={String(value ?? '#000000')}
            onChange={(e) => { onChange(e.target.value); onCommit(e.target.value) }}
            className="w-7 h-6 rounded border border-gray-700 bg-transparent cursor-pointer"
          />
          <input
            className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-100 outline-none font-mono"
            value={String(value ?? '#000000')}
            onChange={(e) => onChange(e.target.value)}
            onBlur={(e) => onCommit(e.target.value)}
          />
        </div>
      )
  }
}

function NumberInput({
  value, onCommit, placeholder,
}: {
  value: number
  onCommit: (v: number) => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState(String(value))
  return (
    <input
      type="number"
      className="w-16 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-[11px] text-gray-100 outline-none focus:border-gray-500"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const n = Number(draft)
        if (Number.isFinite(n) && n !== value) onCommit(n)
        else setDraft(String(value))
      }}
    />
  )
}
