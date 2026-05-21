// ── Spline Point Inspector (BL-73 Sprint 5) ──────────────────────────────────
//
// Properties section for the currently-selected spline point. Lets the user
// change its type, edit its position, nudge its bezier handles, and delete it —
// the panel equivalent of the right-click point menu. All edits dispatch
// undoable makeUpdateLayerCmd commands via the mutation helpers.

'use client'

import type { Layer } from '@/lib/types'
import type { SplinePathData, SplinePointType } from '@/lib/types/spline'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import { makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import {
  moveSplinePoint, moveSplineHandle, setSplinePointType, deleteSplinePoint,
} from '@/lib/spline'

interface Props {
  layer: Layer
  pointId: string | null
  dispatchCommand: (cmd: EditorCommand) => void
}

const TYPES: { value: SplinePointType; label: string }[] = [
  { value: 'corner',       label: 'Corner' },
  { value: 'smooth',       label: 'Smooth' },
  { value: 'bezier',       label: 'Bezier' },
  { value: 'bezierCorner', label: 'Bezier Corner' },
]

function NumberField({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  return (
    <label className="flex items-center gap-1 text-[11px] text-gray-400">
      <span className="w-4">{label}</span>
      <input
        type="number"
        defaultValue={Math.round(value * 100) / 100}
        key={`${label}:${value}`}
        onBlur={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v) && v !== value) onCommit(v) }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        className="w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-100 text-[11px]"
      />
    </label>
  )
}

export default function SplinePointInspector({ layer, pointId, dispatchCommand }: Props) {
  if (layer.type !== 'spline' || !layer.spline || !pointId) return null
  const spline = layer.spline
  const point = spline.points[pointId]
  if (!point) return null

  const handles = Object.values(spline.handles).filter(h => h.pointId === pointId)
  const inH  = handles.find(h => h.kind === 'in')
  const outH = handles.find(h => h.kind === 'out')

  const apply = (next: SplinePathData) => {
    if (next !== spline) dispatchCommand(makeUpdateLayerCmd(layer.id, { spline: next }, layer))
  }

  return (
    <div className="border-t border-gray-700 px-3 py-2 space-y-2" data-panel="spline-point">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-gray-200 uppercase tracking-wide">Spline Point</span>
        <button
          onClick={() => apply(deleteSplinePoint(spline, pointId))}
          className="text-[11px] text-red-400 hover:text-red-300"
        >
          Delete
        </button>
      </div>

      {/* Type */}
      <label className="flex items-center gap-2 text-[11px] text-gray-400">
        <span className="w-10">Type</span>
        <select
          value={point.type}
          onChange={(e) => apply(setSplinePointType(spline, pointId, e.target.value as SplinePointType))}
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-100 text-[11px]"
        >
          {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </label>

      {/* Position */}
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="X" value={point.x} onCommit={(v) => apply(moveSplinePoint(spline, pointId, v, point.y))} />
        <NumberField label="Y" value={point.y} onCommit={(v) => apply(moveSplinePoint(spline, pointId, point.x, v))} />
      </div>

      {/* In handle */}
      {inH && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="iX" value={inH.x} onCommit={(v) => apply(moveSplineHandle(spline, pointId, 'in', v, inH.y))} />
          <NumberField label="iY" value={inH.y} onCommit={(v) => apply(moveSplineHandle(spline, pointId, 'in', inH.x, v))} />
        </div>
      )}

      {/* Out handle */}
      {outH && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="oX" value={outH.x} onCommit={(v) => apply(moveSplineHandle(spline, pointId, 'out', v, outH.y))} />
          <NumberField label="oY" value={outH.y} onCommit={(v) => apply(moveSplineHandle(spline, pointId, 'out', outH.x, v))} />
        </div>
      )}
    </div>
  )
}
