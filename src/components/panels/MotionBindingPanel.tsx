'use client'
import ScrubInput from '../inputs/ScrubInput'
// ── MotionBindingPanel ────────────────────────────────────────────────────────
// Visual editor for ChronoScene.bindings — linear remap driver → driven.
//
// Note (BL-05): The expression-based parameter wires that briefly lived here
// as a second tab moved to their own panel (WiringListPanel) + modal flow
// (WireParameterModal), so they're discoverable from PropertiesPanel's 🔗
// icon and don't crowd this panel's linear-remap UX. See
// docs/parameter-wiring-ui-plan.md.

import type {
  ChronoScene, Binding, BindingSource, BindingTarget, BindingSourceType, BindingTargetType,
} from '@/lib/types'
import { ANIMATABLE_PROPERTIES, isPropertyAnimatableOn } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { newBinding } from '@/lib/defaults'
import {
  makeAddBindingCmd, makeDeleteBindingCmd, makeUpdateBindingCmd,
} from '@/lib/editor/commands-interactive'

interface Props {
  scene: ChronoScene
  editor: EditorStateReturn
}

const SOURCE_TYPES: BindingSourceType[] = ['layerProperty', 'parameter']
const TARGET_TYPES: BindingTargetType[] = ['layerProperty', 'timelineProgress', 'parameter']

export default function MotionBindingPanel({ scene, editor }: Props) {
  return (
    <div className="flex flex-col h-full text-xs text-gray-300">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          Linear Bindings
        </span>
        <button
          className="text-[11px] px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
          onClick={() => editor.dispatchCommand(makeAddBindingCmd(newBinding()))}
        >
          + Add Binding
        </button>
      </div>

      {scene.bindings.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-4 text-center text-[11px] text-gray-500">
          <div>
            <p>No linear bindings yet.</p>
            <p className="mt-2 text-gray-600">
              Add one to link a layer&apos;s property (or a parameter) to another
              layer / timeline through a linear remap.
            </p>
            <p className="mt-2 text-gray-600 italic">
              Need formulas (map, clamp, sin…)? Use the <b>Wires</b> panel
              instead — or click 🔗 on any property in the Properties panel.
            </p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {scene.bindings.map((b) => (
          <BindingCard key={b.id} binding={b} scene={scene} editor={editor} />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Card
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
// Source / target pickers
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
    (p) => isPropertyAnimatableOn(p, layer.type),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI helpers
// ─────────────────────────────────────────────────────────────────────────────

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
      <ScrubInput disableScrub fieldLabel={label + ' minimum'} value={min} onChange={value => onCommit(value, max)} />
      <span className="text-gray-600">→</span>
      <ScrubInput disableScrub fieldLabel={label + ' maximum'} value={max} onChange={value => onCommit(min, value)} />
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
