// ── Schema-Driven Properties Panel ────────────────────────────────────────────
//
// Renders ALL PropertyGroups returned by a layer's LayerDefinition. Replaces
// hand-written JSX for any layer type that doesn't need a fully custom UI.
//
// New layer types get a working inspector automatically — they just need to
// publish a definition with getPropertyGroups().
//
// Specialised UIs (Bezier anchor list, Plugin Effects, Masks, Follow Path)
// remain hand-written in PropertiesPanel.tsx — they're not generically
// schema-able.

'use client'
import type { Layer } from '@/lib/types'
import type { PropertySchema, PropertyGroup } from '@/lib/registry'
import { layerRegistry } from '@/lib/registry'
import ScrubInput from '@/components/inputs/ScrubInput'
import { NumericPropertyScope } from '@/components/inputs/expressions/NumericPropertyContext'
import { readPropertyPath } from '@/lib/scene/properties/readPropertyPath'
import { writePropertyPath } from '@/lib/scene/properties/writePropertyPath'
import ColorInput from '@/components/inputs/ColorInput'
import GradientInput from '@/components/inputs/GradientInput'
import type { GradientFill } from '@/lib/types'

interface Props {
  layer: Layer
  onLayerChange: (layer: Layer) => void
  /**
   * Optional filter — return false to skip a section. Used by PropertiesPanel
   * to hide groups that already have a hand-written equivalent (Transform,
   * Appearance, Shape, etc. for richly-customised layer types).
   */
  filterGroup?: (group: PropertyGroup) => boolean
}

/** Render registered source schemas. Numeric fields retain their explicit source
 * path for formula commands; literal changes use the shared immutable writer.
 * No source is mutated or expression evaluated by rendering the inspector. */
export default function SchemaPanel({ layer, onLayerChange, filterGroup }: Props) {
  const def = layerRegistry.findForLayer(layer)
  if (!def?.getPropertyGroups) return null
  const groups = def.getPropertyGroups(layer)

  return (
    <>
      {groups.map((group) => {
        if (filterGroup && !filterGroup(group)) return null
        if (group.showWhen && !group.showWhen(layer)) return null
        const visible = group.schemas.filter(s => !s.showWhen || s.showWhen(layer))
        if (visible.length === 0) return null

        return (
          <div key={group.title} className="flex flex-col gap-2">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pt-1 border-t border-gray-700">
              {group.title}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {visible.map(schema => (
                <div key={schema.id} className={schema.fullWidth ? 'col-span-2' : ''}>
                  <SchemaField
                    schema={schema}
                    value={readPropertyPath(layer, schema.path) ?? schema.defaultValue}
                    onChange={(v) => onLayerChange(writePropertyPath(layer, schema.path, v, true))}
                  />
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </>
  )
}

// ── Generic field renderer ────────────────────────────────────────────────────

interface FieldProps {
  schema:    PropertySchema
  value:     unknown
  onChange:  (v: unknown) => void
}

/** Adapt a typed schema field to its existing control. Numeric ranges and units
 * remain source values (no implicit percent/angle conversion). */
function SchemaField({ schema, value, onChange }: FieldProps) {
  const inputClass =
    "w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 " +
    "focus:outline-none focus:border-blue-500 [appearance:textfield] " +
    "[&::-webkit-inner-spin-button]:appearance-none"

  // Booleans: render with a horizontal label so they sit nicely in a 2-col grid
  if (schema.valueType === 'boolean') {
    return (
      <label className="col-span-2 flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          className="accent-blue-500"
        />
        {schema.label}
        {schema.help && <span className="text-[10px] text-gray-600">— {schema.help}</span>}
      </label>
    )
  }

  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] text-gray-500 uppercase tracking-wide">
        {schema.label}
        {(schema.valueType === 'angle')   && <span className="text-gray-600"> °</span>}
        {(schema.valueType === 'percent') && <span className="text-gray-600"> %</span>}
      </span>

      {schema.valueType === 'color' && (
        <ColorInput
          value={String(value ?? '#000000')}
          onChange={(v) => onChange(v)}
        />
      )}

      {schema.valueType === 'gradient' && (
        <GradientInput
          value={(value as GradientFill | undefined)}
          onChange={(g) => onChange(g)}
        />
      )}

      {schema.valueType === 'select' && (
        <select
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        >
          {schema.options?.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      )}

      {schema.valueType === 'string' && (
        <input
          type="text"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      )}

      {(schema.valueType === 'number' || schema.valueType === 'angle' || schema.valueType === 'percent') && (
        <NumericPropertyScope path={schema.path} label={schema.label}><ScrubInput
          value={Number(value ?? 0)}
          min={schema.min}
          max={schema.max}
          step={schema.step ?? 1}
          onChange={(v) => onChange(v)}
        /></NumericPropertyScope>
      )}
    </label>
  )
}
