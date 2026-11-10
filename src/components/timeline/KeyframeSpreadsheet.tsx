'use client'
// ── KeyframeSpreadsheet (BL-07) ───────────────────────────────────────────────
// Editable table of the currently selected keyframes. Click a cell, type, hit
// Enter to commit. Time, value, and easing are all editable here so users can
// nudge values precisely without dragging on the timeline.
//
// Used as a docked drawer below the TimelinePanel — toggleable from the
// TrackToolBar's "⊞ Sheet" button.

import { useRef, useState } from 'react'
import type { EasingType } from '@/lib/types'

const EASING_TYPES: EasingType[] = [
  'linear', 'hold', 'easeIn', 'easeOut', 'easeInOut', 'customBezier',
]

export interface KeyframeSheetRow {
  kfId:         string
  trackTarget:  string
  /** Human label, e.g. "rect1 / opacity". */
  label:        string
  timeMs:       number
  /** Number or 'non-numeric' marker — non-numeric kfs render disabled. */
  value:        number | null
  easingType:   EasingType
}

interface Props {
  rows: KeyframeSheetRow[]
  /** Commit a new time value (already validated). */
  onUpdateTime: (kfId: string, trackTarget: string, fromMs: number, toMs: number) => void
  /** Commit a new value (numeric only). */
  onUpdateValue: (kfId: string, trackTarget: string, fromValue: number, toValue: number) => void
  /** Commit a new easing. */
  onUpdateEasing: (kfId: string, trackTarget: string, toEasing: EasingType) => void
  onDelete: (kfId: string, trackTarget: string) => void
  onClose: () => void
}

export default function KeyframeSpreadsheet({
  rows, onUpdateTime, onUpdateValue, onUpdateEasing, onDelete, onClose,
}: Props) {
  const cancelled = useRef(false)
  const [editing, setEditing] = useState<{ kfId: string; field: 'time' | 'value'; draft: string } | null>(null)

  function startEdit(kfId: string, field: 'time' | 'value', initial: string) {
    cancelled.current = false
    setEditing({ kfId, field, draft: initial })
  }

  function commitEdit(row: KeyframeSheetRow) {
    if (cancelled.current || !editing || editing.kfId !== row.kfId) return
    const num = parseFloat(editing.draft)
    if (!Number.isFinite(num)) { setEditing(null); return }
    if (editing.field === 'time' && num !== row.timeMs) {
      onUpdateTime(row.kfId, row.trackTarget, row.timeMs, num)
    }
    if (editing.field === 'value' && row.value !== null && num !== row.value) {
      onUpdateValue(row.kfId, row.trackTarget, row.value, num)
    }
    setEditing(null)
  }

  return (
    <div className="border-t border-cyan-900/60 bg-gray-950 max-h-[40vh] flex flex-col shrink-0">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1 bg-gray-900 border-b border-gray-800 shrink-0">
        <span className="text-[11px] font-mono text-cyan-400">
          ⊞ Keyframe Spreadsheet  <span className="text-gray-500">({rows.length} row{rows.length !== 1 ? 's' : ''})</span>
        </span>
        <button
          onClick={onClose}
          className="text-[12px] text-gray-500 hover:text-gray-300"
          title="Close spreadsheet"
        >×</button>
      </div>

      {rows.length === 0 ? (
        <div className="p-3 text-center text-[11px] text-gray-500">
          No keyframes selected. Pick one or more keyframes to see them here.
        </div>
      ) : (
        <div className="overflow-auto flex-1">
          <table className="w-full text-[11px] font-mono">
            <thead className="bg-gray-900 sticky top-0">
              <tr className="text-gray-500 text-[10px] uppercase tracking-wider">
                <th className="px-2 py-1 text-left">Track</th>
                <th className="px-2 py-1 text-right">Time (ms)</th>
                <th className="px-2 py-1 text-right">Value</th>
                <th className="px-2 py-1 text-left">Easing</th>
                <th className="px-2 py-1 text-center w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isEditingTime  = editing?.kfId === row.kfId && editing.field === 'time'
                const isEditingValue = editing?.kfId === row.kfId && editing.field === 'value'
                return (
                  <tr key={`${row.trackTarget}/${row.kfId}`} className="border-t border-gray-900 hover:bg-gray-900/60">
                    <td className="px-2 py-1 text-gray-400 truncate max-w-[200px]" title={row.trackTarget}>
                      {row.label}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {isEditingTime ? (
                        <input
                          autoFocus
                          type="number"
                          value={editing!.draft}
                          onChange={(e) => setEditing({ ...editing!, draft: e.target.value })}
                          onBlur={() => commitEdit(row)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEdit(row)
                            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelled.current = true; setEditing(null) }
                          }}
                          className="w-20 bg-gray-800 border border-cyan-700 rounded px-1 py-0.5 text-right text-cyan-200 outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => startEdit(row.kfId, 'time', row.timeMs.toString())}
                          className="text-gray-300 hover:text-cyan-300 hover:bg-gray-800 rounded px-1"
                        >
                          {row.timeMs.toFixed(0)}
                        </button>
                      )}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {row.value === null ? (
                        <span className="text-gray-600 italic text-[10px]">non-numeric</span>
                      ) : isEditingValue ? (
                        <input
                          autoFocus
                          type="number"
                          step="any"
                          value={editing!.draft}
                          onChange={(e) => setEditing({ ...editing!, draft: e.target.value })}
                          onBlur={() => commitEdit(row)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEdit(row)
                            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelled.current = true; setEditing(null) }
                          }}
                          className="w-24 bg-gray-800 border border-cyan-700 rounded px-1 py-0.5 text-right text-cyan-200 outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => startEdit(row.kfId, 'value', String(row.value))}
                          className="text-gray-300 hover:text-cyan-300 hover:bg-gray-800 rounded px-1"
                        >
                          {formatValue(row.value)}
                        </button>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      <select
                        value={row.easingType}
                        onChange={(e) => onUpdateEasing(row.kfId, row.trackTarget, e.target.value as EasingType)}
                        className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-200 outline-none focus:border-cyan-600"
                      >
                        {EASING_TYPES.map((et) => (
                          <option key={et} value={et}>{et}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-1 text-center">
                      <button
                        onClick={() => onDelete(row.kfId, row.trackTarget)}
                        className="text-gray-600 hover:text-red-400 text-[12px]"
                        title="Delete keyframe"
                      >🗑</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function formatValue(v: number): string {
  if (Math.abs(v) >= 100) return v.toFixed(1)
  if (Math.abs(v) >= 1)   return v.toFixed(2)
  return v.toFixed(3)
}
