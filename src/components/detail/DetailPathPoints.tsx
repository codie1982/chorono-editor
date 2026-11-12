'use client'
import { useState } from 'react'
import type { Layer } from '@/lib/types'
import { moveAnchor } from '@/lib/path/pathOps'
import ScrubInput from '@/components/inputs/ScrubInput'

/** Bounded point inspector: one existing Bézier anchor at a time, in path-local
 * pixels. Existing moveAnchor preserves relative handles; no topology/key/ID
 * rewrite or second path-edit algorithm is introduced by the detail host.
 */
export function DetailPathPoints({ layer, reason, onChange }: { layer: Layer; reason: string | null; onChange(layer: Layer): void }) {
  const [index, setIndex] = useState(0)
  if (!layer.path?.anchors.length) return null
  const active = Math.min(index, layer.path.anchors.length - 1), point = layer.path.anchors[active]
  return <fieldset disabled={!!reason} className="flex flex-col gap-2 border-t border-gray-700 pt-3">
    <legend className="text-xs text-gray-300">Path points · local px</legend>
    {reason && <p className="text-xs text-amber-200">{reason}</p>}
    <label className="text-xs">Point (1–{layer.path.anchors.length})
      <input aria-label="Path point" type="number" min={1} max={layer.path.anchors.length} value={active + 1}
        onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) setIndex(Math.max(0, Math.min(layer.path!.anchors.length - 1, Math.floor(value) - 1))) }} className="w-full bg-gray-800 border border-gray-600 rounded p-1" />
    </label>
    {(['x', 'y'] as const).map(axis => <label key={axis} className="text-xs">Point {axis.toUpperCase()}
      <ScrubInput value={point[axis]} onChange={value => {
        if (reason || !Number.isFinite(value)) return
        onChange({ ...layer, path: moveAnchor(layer.path!, active, axis === 'x' ? value - point.x : 0, axis === 'y' ? value - point.y : 0) })
      }} />
    </label>)}
  </fieldset>
}
