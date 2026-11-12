// ── GradientInput ───────────────────────────────────────────────────────────────
//
// Edits a GradientFill object: linear/radial type, angle (linear only), and a
// list of colour stops (add / remove / recolour / reposition). Renders a live
// CSS preview bar. Used by SchemaPanel for any schema with valueType 'gradient'.

'use client'
import { useEffect } from 'react'
import type { GradientFill, GradientStop } from '@/lib/types'
import ColorInput from './ColorInput'
import ScrubInput from './ScrubInput'
import { NumericPropertyProvider } from './expressions/NumericPropertyContext'
import { TextInput } from './TextInput'

interface Props {
  value:    GradientFill | undefined
  onChange: (g: GradientFill) => void
}

const DEFAULT_GRADIENT: GradientFill = {
  type: 'linear',
  angle: 90,
  stops: [
    { offset: 0, color: '#6366F1' },
    { offset: 1, color: '#EC4899' },
  ],
}

function coerce(value: GradientFill | undefined): GradientFill {
  if (!value || !Array.isArray(value.stops) || value.stops.length < 2) {
    return DEFAULT_GRADIENT
  }
  return value
}

/** CSS preview string. Canvas angle (0 = top→bottom, 90 = left→right) maps to
 *  CSS via (180 − angle); good enough for an indicative swatch. */
function toCssBackground(g: GradientFill): string {
  const stops = [...g.stops]
    .sort((a, b) => a.offset - b.offset)
    .map(s => `${s.color} ${Math.round(s.offset * 100)}%`)
    .join(', ')
  if (g.type === 'radial') return `radial-gradient(circle, ${stops})`
  return `linear-gradient(${180 - (g.angle ?? 0)}deg, ${stops})`
}

export default function GradientInput({ value, onChange }: Props) {
  const g = coerce(value)

  // Seed a real gradient the first time the editor appears with none stored, so
  // the canvas shows a gradient immediately on switching the fill to 'gradient'.
  useEffect(() => {
    if (!value || !Array.isArray(value.stops) || value.stops.length < 2) {
      onChange(DEFAULT_GRADIENT)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const update = (patch: Partial<GradientFill>) => onChange({ ...g, ...patch })

  const updateStop = (i: number, patch: Partial<GradientStop>) => {
    const stops = g.stops.map((s, idx) => (idx === i ? { ...s, ...patch } : s))
    onChange({ ...g, stops })
  }

  const addStop = () => {
    const sorted = [...g.stops].sort((a, b) => a.offset - b.offset)
    // Insert at the largest gap's midpoint.
    let bestGap = -1, bestMid = 0.5, bestColor = '#FFFFFF'
    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = sorted[i + 1].offset - sorted[i].offset
      if (gap > bestGap) { bestGap = gap; bestMid = (sorted[i].offset + sorted[i + 1].offset) / 2; bestColor = sorted[i].color }
    }
    onChange({ ...g, stops: [...g.stops, { offset: bestMid, color: bestColor }] })
  }

  const removeStop = (i: number) => {
    if (g.stops.length <= 2) return   // keep at least two
    onChange({ ...g, stops: g.stops.filter((_, idx) => idx !== i) })
  }

  const selectClass =
    "w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 " +
    "focus:outline-none focus:border-blue-500"

  return (
    <NumericPropertyProvider><div className="flex flex-col gap-2">
      {/* Preview bar */}
      <div
        className="h-6 w-full rounded border border-gray-600"
        style={{ background: toCssBackground(g) }}
        title="Gradient preview"
      />

      {/* Type + angle */}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-gray-500 uppercase tracking-wide">Type</span>
          <TextInput value={g.type} fieldLabel="Gradient type" options={[{value:'linear',label:'Linear'},{value:'radial',label:'Radial'}]}
            onChange={type => update({type: type as GradientFill['type']})} className={selectClass} />
        </label>
        {g.type === 'linear' && (
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] text-gray-500 uppercase tracking-wide">Angle °</span>
            <ScrubInput
              fieldLabel="Gradient angle" value={g.angle ?? 0}
              min={0}
              max={360}
              step={1}
              onChange={(v) => update({ angle: v })}
            />
          </label>
        )}
      </div>

      {/* Stops */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-gray-500 uppercase tracking-wide">Stops</span>
        {g.stops.map((s, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className="flex-1 min-w-0">
              <ColorInput fieldLabel={`Gradient stop ${i+1} color`} value={s.color} onChange={(c) => updateStop(i, { color: c })} />
            </div>
            <div className="w-16 shrink-0">
              <ScrubInput
                fieldLabel={`Gradient stop ${i+1} position`} value={Math.round(s.offset * 100)}
                min={0}
                max={100}
                step={1}
                onChange={(v) => updateStop(i, { offset: Math.max(0, Math.min(1, v / 100)) })}
              />
            </div>
            <button
              type="button"
              onClick={() => removeStop(i)}
              disabled={g.stops.length <= 2}
              className="shrink-0 w-6 h-6 rounded text-xs text-gray-400 hover:text-red-400
                         hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Remove stop"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addStop}
          className="self-start text-[11px] text-blue-400 hover:text-blue-300 mt-0.5"
        >
          + Add stop
        </button>
      </div>
    </div></NumericPropertyProvider>
  )
}
