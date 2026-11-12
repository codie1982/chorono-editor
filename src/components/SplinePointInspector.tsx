// ── Spline Point Inspector (BL-73 Sprint 5) ──────────────────────────────────
//
// Properties section for the currently-selected spline point. Lets the user
// change its type, edit its position, nudge its bezier handles, and delete it —
// the panel equivalent of the right-click point menu. All edits dispatch
// undoable makeUpdateLayerCmd commands via the mutation helpers.

'use client'
import { DocumentationHelp } from '@/components/help/DocumentationHelp'

import { Vector2Input } from '@/components/inputs/Vector2Input'
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
        <DocumentationHelp topic="editor/canvas/splines" className="ml-auto mr-1" />
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

      <Vector2Input label="Point position" propertyPath={`spline.points.${pointId}`} value={point}
        onChange={position => apply(moveSplinePoint(spline, pointId, position.x, position.y))} />

      {/* In handle */}
      {inH && (
        <Vector2Input label="In handle" propertyPath={`spline.handles.${inH.id}`} value={inH}
          onChange={position => apply(moveSplineHandle(spline, pointId, 'in', position.x, position.y))} />
      )}

      {/* Out handle */}
      {outH && (
        <Vector2Input label="Out handle" propertyPath={`spline.handles.${outH.id}`} value={outH}
          onChange={position => apply(moveSplineHandle(spline, pointId, 'out', position.x, position.y))} />
      )}
    </div>
  )
}
