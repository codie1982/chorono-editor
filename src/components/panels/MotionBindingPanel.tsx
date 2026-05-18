'use client'
// ── MotionBindingPanel ────────────────────────────────────────────────────────
// Visual editor for two related but distinct binding systems:
//
//   1. Linear Bindings (ChronoScene.bindings) — driver → linear remap → driven.
//      Fast path. Inputs come as min/max sliders, outputs are interpolated
//      with optional clamp + reverse.
//
//   2. Expression Wires (ChronoScene.parameterWires, BL-05) — source → safe
//      expression → target. Same shape but the math is a whitelist-evaluated
//      formula like "map(s, 0, 1, 0, 360)" or "clamp(sin(s * 3.14) * 100, -50, 50)".
//      Use when a linear remap isn't enough (trig, easing curves, conditions).

import { useState } from 'react'
import type {
  ChronoScene, Binding, BindingSource, BindingTarget, BindingSourceType, BindingTargetType,
  ParameterWire,
} from '@/lib/types'
import { ANIMATABLE_PROPERTIES } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { newBinding, newParameterWire } from '@/lib/defaults'
import {
  makeAddBindingCmd, makeDeleteBindingCmd, makeUpdateBindingCmd,
  makeAddParameterWireCmd, makeDeleteParameterWireCmd, makeUpdateParameterWireCmd,
} from '@/lib/editor/commands-interactive'
import ExpressionEditor from './ExpressionEditor'

interface Props {
  scene: ChronoScene
  editor: EditorStateReturn
}

type Tab = 'linear' | 'expression'

const SOURCE_TYPES: BindingSourceType[] = ['layerProperty', 'parameter']
const TARGET_TYPES: BindingTargetType[] = ['layerProperty', 'timelineProgress', 'parameter']

export default function MotionBindingPanel({ scene, editor }: Props) {
  const [tab, setTab] = useState<Tab>('linear')
  const wires = scene.parameterWires ?? []

  return (
    <div className="flex flex-col h-full text-xs text-gray-300">
      {/* Tab strip */}
      <div className="flex items-center border-b border-gray-700">
        <TabButton
          active={tab === 'linear'}
          onClick={() => setTab('linear')}
          count={scene.bindings.length}
          label="Linear"
        />
        <TabButton
          active={tab === 'expression'}
          onClick={() => setTab('expression')}
          count={wires.length}
          label="Expression"
        />
        <div className="flex-1" />
        <button
          className="text-[11px] px-2 py-1.5 mr-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
          onClick={() =>
            tab === 'linear'
              ? editor.dispatchCommand(makeAddBindingCmd(newBinding()))
              : editor.dispatchCommand(makeAddParameterWireCmd(newParameterWire()))
          }
        >
          + Add {tab === 'linear' ? 'Binding' : 'Wire'}
        </button>
      </div>

      {tab === 'linear' ? (
        <LinearBindingsTab scene={scene} editor={editor} />
      ) : (
        <ExpressionWiresTab scene={scene} editor={editor} wires={wires} />
      )}
    </div>
  )
}

function TabButton({
  active, onClick, count, label,
}: {
  active: boolean
  onClick: () => void
  count: number
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-[11px] font-medium border-b-2 transition-colors ${
        active
          ? 'border-amber-400 text-gray-100'
          : 'border-transparent text-gray-500 hover:text-gray-300'
      }`}
    >
      {label}
      {count > 0 && (
        <span className={`ml-1.5 px-1 rounded text-[9px] ${
          active ? 'bg-amber-500/20 text-amber-300' : 'bg-gray-800 text-gray-500'
        }`}>
          {count}
        </span>
      )}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Linear bindings tab (existing UI)
// ─────────────────────────────────────────────────────────────────────────────

function LinearBindingsTab({ scene, editor }: { scene: ChronoScene; editor: EditorStateReturn }) {
  if (scene.bindings.length === 0) {
    return (
      <EmptyState>
        No linear bindings yet. Add one to link a layer&apos;s property (or a
        parameter) to another layer / timeline through a remap.
      </EmptyState>
    )
  }
  return (
    <div className="flex-1 overflow-y-auto">
      {scene.bindings.map((b) => (
        <BindingCard key={b.id} binding={b} scene={scene} editor={editor} />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Expression wires tab (BL-05)
// ─────────────────────────────────────────────────────────────────────────────

function ExpressionWiresTab({
  scene, editor, wires,
}: {
  scene: ChronoScene
  editor: EditorStateReturn
  wires: ParameterWire[]
}) {
  if (wires.length === 0) {
    return (
      <EmptyState>
        <p>No expression wires yet.</p>
        <p className="mt-2 text-gray-600">
          Use wires for formula-driven bindings:<br />
          <code className="text-amber-400">map(s, 0, 1, 0, 360)</code> · <code className="text-amber-400">sin(s * 3.14) * 100</code>
        </p>
      </EmptyState>
    )
  }
  return (
    <div className="flex-1 overflow-y-auto">
      {wires.map((w) => (
        <WireCard key={w.id} wire={w} scene={scene} editor={editor} />
      ))}
    </div>
  )
}

function WireCard({
  wire, scene, editor,
}: {
  wire: ParameterWire
  scene: ChronoScene
  editor: EditorStateReturn
}) {
  function patch(next: Partial<ParameterWire>) {
    const updated: ParameterWire = { ...wire, ...next }
    editor.dispatchCommand(makeUpdateParameterWireCmd(wire.id, wire, updated))
  }

  // Live source value preview — pull from scene parameters or static layer prop
  const sourcePreview = resolveSourcePreview(scene, wire.sourceParamId)

  return (
    <div className={`px-3 py-2 border-b border-gray-800 ${!wire.enabled ? 'opacity-50' : ''}`}>
      {/* Enable + delete row */}
      <div className="flex items-center justify-between mb-1.5">
        <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-gray-400">
          <input
            type="checkbox"
            checked={wire.enabled}
            onChange={(e) => patch({ enabled: e.target.checked })}
          />
          {wire.enabled ? 'Enabled' : 'Disabled'}
        </label>
        <button
          className="text-[10px] text-red-400 hover:text-red-300"
          onClick={() => editor.dispatchCommand(makeDeleteParameterWireCmd(wire))}
        >
          ✕ Delete
        </button>
      </div>

      {/* Source */}
      <div className="mb-2">
        <div className="text-[9px] uppercase tracking-wider text-amber-400 mb-1">Source</div>
        <PathPicker
          value={wire.sourceParamId}
          scene={scene}
          onChange={(v) => patch({ sourceParamId: v })}
          allowParameters
          allowLayerProperties
        />
      </div>

      {/* Expression */}
      <div className="mb-2">
        <div className="text-[9px] uppercase tracking-wider text-sky-400 mb-1">Expression</div>
        <ExpressionEditor
          expression={wire.expression}
          sourceValue={sourcePreview}
          onCommit={(expr) => patch({ expression: expr })}
        />
      </div>

      {/* Target */}
      <div>
        <div className="text-[9px] uppercase tracking-wider text-emerald-400 mb-1">Target</div>
        <PathPicker
          value={wire.targetParamId}
          scene={scene}
          onChange={(v) => patch({ targetParamId: v })}
          allowLayerProperties
        />
      </div>
    </div>
  )
}

/** Read a source value (or null) from the scene for preview purposes. Without
 *  a live OverrideMap we can only show static fallbacks here — the goal is
 *  to give the author a sense of magnitude, not exact runtime values. */
function resolveSourcePreview(scene: ChronoScene, sourceParamId: string): number | null {
  if (!sourceParamId) return null
  if (sourceParamId.startsWith('params.')) {
    const id = sourceParamId.slice('params.'.length)
    const p = scene.parameters.find((pp) => pp.id === id)
    if (!p) return null
    const v = p.defaultValue
    if (typeof v === 'number')  return v
    if (typeof v === 'boolean') return v ? 1 : 0
    if (typeof v === 'string') {
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    }
    return null
  }
  if (sourceParamId.startsWith('layers.')) {
    const parts = sourceParamId.split('.')
    if (parts.length < 3) return null
    const layer = scene.layers.find((l) => l.id === parts[1])
    if (!layer) return null
    let v: unknown = layer
    for (const seg of parts.slice(2)) {
      if (v == null || typeof v !== 'object') return null
      v = (v as Record<string, unknown>)[seg]
    }
    return typeof v === 'number' ? v : null
  }
  return null
}

/** PathPicker — builds source/target strings like "params.X" or "layers.X.prop"
 *  by picking from selectors instead of free-typing. Reduces typos and makes
 *  available options discoverable. */
function PathPicker({
  value, scene, onChange, allowParameters = false, allowLayerProperties = false,
}: {
  value: string
  scene: ChronoScene
  onChange: (v: string) => void
  allowParameters?: boolean
  allowLayerProperties?: boolean
}) {
  const kind: 'param' | 'layer' | 'none' =
    value.startsWith('params.') ? 'param' :
    value.startsWith('layers.') ? 'layer' :
    'none'

  const [kindState, setKindState] = useState<'param' | 'layer'>(
    kind === 'none' ? (allowParameters ? 'param' : 'layer') : kind,
  )

  // Decompose layer path into layerId + property
  let layerId = ''
  let property = ''
  if (kind === 'layer') {
    const parts = value.split('.')
    layerId = parts[1] ?? ''
    property = parts.slice(2).join('.')
  }
  const paramId = kind === 'param' ? value.slice('params.'.length) : ''

  function commitLayer(nextLayerId: string, nextProperty: string) {
    if (nextLayerId && nextProperty) onChange(`layers.${nextLayerId}.${nextProperty}`)
    else if (nextLayerId) onChange(`layers.${nextLayerId}.`)
    else onChange('')
  }

  function commitParam(nextParamId: string) {
    onChange(nextParamId ? `params.${nextParamId}` : '')
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {allowParameters && allowLayerProperties && (
        <Select
          value={kindState}
          onChange={(v) => {
            setKindState(v as 'param' | 'layer')
            onChange('') // clear when switching kind
          }}
          options={[
            { value: 'param', label: 'param' },
            { value: 'layer', label: 'layer' },
          ]}
        />
      )}
      {kindState === 'param' && allowParameters ? (
        <Select
          value={paramId}
          onChange={commitParam}
          options={[
            { value: '', label: '(pick parameter)' },
            ...scene.parameters.map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
      ) : kindState === 'layer' && allowLayerProperties ? (
        <>
          <Select
            value={layerId}
            onChange={(v) => commitLayer(v, property)}
            options={[
              { value: '', label: '(layer)' },
              ...scene.layers.map((l) => ({ value: l.id, label: l.name })),
            ]}
          />
          <Select
            value={property}
            onChange={(v) => commitLayer(layerId, v)}
            options={[
              { value: '', label: '(property)' },
              ...propertiesForLayer(scene, layerId).map((p) => ({
                value: p.path, label: p.label,
              })),
            ]}
          />
        </>
      ) : null}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Linear binding card (unchanged — extracted to keep parity with previous UI)
// ─────────────────────────────────────────────────────────────────────────────

function BindingCard({
  binding, scene, editor,
}: {
  binding: Binding
  scene: ChronoScene
  editor: EditorStateReturn
}) {
  function patch(next: Partial<Binding>) {
    const updated: Binding = { ...binding, ...next }
    editor.dispatchCommand(makeUpdateBindingCmd(binding.id, binding, updated))
  }
  function patchSource(p: Partial<BindingSource>) {
    patch({ source: { ...binding.source, ...p } })
  }
  function patchTarget(p: Partial<BindingTarget>) {
    patch({ target: { ...binding.target, ...p } })
  }
  function patchMap(p: Partial<Binding['map']>) {
    patch({ map: { ...binding.map, ...p } })
  }

  return (
    <div className="px-3 py-2 border-b border-gray-800">
      {/* Driver row */}
      <div className="mb-2">
        <div className="text-[9px] uppercase tracking-wider text-amber-400 mb-1">Driver</div>
        <div className="flex items-center gap-1.5">
          <Select
            value={binding.source.type}
            onChange={(v) => patchSource({ type: v as BindingSourceType })}
            options={SOURCE_TYPES.map((t) => ({ value: t, label: t }))}
          />
          <SourcePicker source={binding.source} scene={scene} onChange={patchSource} />
        </div>
        <RangeRow
          label="Input"
          min={binding.map.inputMin}
          max={binding.map.inputMax}
          onCommit={(min, max) => patchMap({ inputMin: min, inputMax: max })}
        />
      </div>

      {/* Driven row */}
      <div className="mb-2">
        <div className="text-[9px] uppercase tracking-wider text-emerald-400 mb-1">Driven</div>
        <div className="flex items-center gap-1.5">
          <Select
            value={binding.target.type}
            onChange={(v) => patchTarget({ type: v as BindingTargetType })}
            options={TARGET_TYPES.map((t) => ({ value: t, label: t }))}
          />
          <TargetPicker target={binding.target} scene={scene} onChange={patchTarget} />
        </div>
        <RangeRow
          label="Output"
          min={binding.map.outputMin}
          max={binding.map.outputMax}
          onCommit={(min, max) => patchMap({ outputMin: min, outputMax: max })}
        />
      </div>

      {/* Options + delete */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-[10px] text-gray-400">
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={binding.map.clamp ?? true}
              onChange={(e) => patchMap({ clamp: e.target.checked })}
            />
            Clamp
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={binding.map.reverse ?? false}
              onChange={(e) => patchMap({ reverse: e.target.checked })}
            />
            Reverse
          </label>
        </div>
        <button
          className="text-[10px] text-red-400 hover:text-red-300"
          onClick={() => editor.dispatchCommand(makeDeleteBindingCmd(binding))}
        >
          ✕ Delete
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Source / target pickers (linear-binding specific)
// ─────────────────────────────────────────────────────────────────────────────

function SourcePicker({
  source, scene, onChange,
}: {
  source: BindingSource
  scene: ChronoScene
  onChange: (p: Partial<BindingSource>) => void
}) {
  if (source.type === 'parameter') {
    return (
      <Select
        value={source.paramId ?? ''}
        onChange={(v) => onChange({ paramId: v || undefined })}
        options={[
          { value: '', label: '(pick parameter)' },
          ...scene.parameters.map((p) => ({ value: p.id, label: p.name })),
        ]}
      />
    )
  }
  // layerProperty
  return (
    <>
      <Select
        value={source.layerId ?? ''}
        onChange={(v) => onChange({ layerId: v || undefined })}
        options={[
          { value: '', label: '(layer)' },
          ...scene.layers.map((l) => ({ value: l.id, label: l.name })),
        ]}
      />
      <Select
        value={source.property ?? ''}
        onChange={(v) => onChange({ property: v || undefined })}
        options={[
          { value: '', label: '(property)' },
          ...propertiesForLayer(scene, source.layerId).map((p) => ({
            value: p.path, label: p.label,
          })),
        ]}
      />
    </>
  )
}

function TargetPicker({
  target, scene, onChange,
}: {
  target: BindingTarget
  scene: ChronoScene
  onChange: (p: Partial<BindingTarget>) => void
}) {
  switch (target.type) {
    case 'parameter':
      return (
        <Select
          value={target.paramId ?? ''}
          onChange={(v) => onChange({ paramId: v || undefined })}
          options={[
            { value: '', label: '(pick parameter)' },
            ...scene.parameters.map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
      )
    case 'timelineProgress':
      return (
        <Select
          value={target.timelineId ?? ''}
          onChange={(v) => onChange({ timelineId: v || undefined })}
          options={[
            { value: '', label: '(pick timeline)' },
            ...scene.timelines.map((t) => ({ value: t.id, label: t.id })),
          ]}
        />
      )
    case 'layerProperty':
      return (
        <>
          <Select
            value={target.layerId ?? ''}
            onChange={(v) => onChange({ layerId: v || undefined })}
            options={[
              { value: '', label: '(layer)' },
              ...scene.layers.map((l) => ({ value: l.id, label: l.name })),
            ]}
          />
          <Select
            value={target.property ?? ''}
            onChange={(v) => onChange({ property: v || undefined })}
            options={[
              { value: '', label: '(property)' },
              ...propertiesForLayer(scene, target.layerId).map((p) => ({
                value: p.path, label: p.label,
              })),
            ]}
          />
        </>
      )
  }
}

function propertiesForLayer(scene: ChronoScene, layerId?: string) {
  if (!layerId) return ANIMATABLE_PROPERTIES
  const layer = scene.layers.find((l) => l.id === layerId)
  if (!layer) return ANIMATABLE_PROPERTIES
  return ANIMATABLE_PROPERTIES.filter(
    (p) => !p.layerTypes || p.layerTypes.includes(layer.type),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI helpers
// ─────────────────────────────────────────────────────────────────────────────

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 flex items-center justify-center p-4 text-center text-[11px] text-gray-500">
      <div>{children}</div>
    </div>
  )
}

function RangeRow({
  label, min, max, onCommit,
}: {
  label: string
  min: number; max: number
  onCommit: (min: number, max: number) => void
}) {
  return (
    <div className="flex items-center gap-1.5 mt-1 ml-1">
      <span className="text-[10px] text-gray-500 w-12">{label}</span>
      <input
        type="number"
        className="w-16 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-[11px] text-gray-100 outline-none"
        defaultValue={min}
        onBlur={(e) => onCommit(Number(e.target.value), max)}
      />
      <span className="text-gray-600">→</span>
      <input
        type="number"
        className="w-16 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-[11px] text-gray-100 outline-none"
        defaultValue={max}
        onBlur={(e) => onCommit(min, Number(e.target.value))}
      />
    </div>
  )
}

function Select({
  value, onChange, options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[11px] text-gray-100 outline-none focus:border-gray-500"
    >
      {options.map((o) => (
        <option key={o.value || '__empty__'} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}
