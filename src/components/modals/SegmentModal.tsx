'use client'
import { CalculationNumberInput } from '@/components/inputs/CalculationNumberInput'
// ── SegmentModal ──────────────────────────────────────────────────────────────
// Lightweight create / edit modal for TimelineSegment. Used by the timeline
// ruler's segment strip and the Events panel's "+ create segment" shortcut.

import { useState } from 'react'
import type { TimelineSegment } from '@/lib/types'

interface Props {
  initial:     TimelineSegment
  durationMs:  number
  isCreating:  boolean
  onSave:      (segment: TimelineSegment) => void
  onDelete?:   () => void
  onClose:     () => void
}

const PRESET_COLORS = ['#22D3EE', '#34D399', '#FBBF24', '#F87171', '#A78BFA', '#F472B6']

export default function SegmentModal({
  initial, durationMs, isCreating, onSave, onDelete, onClose,
}: Props) {
  const [name,    setName]    = useState(initial.name)
  const [startMs, setStartMs] = useState(initial.startMs)
  const [endMs,   setEndMs]   = useState(initial.endMs)
  const [color,   setColor]   = useState(initial.color ?? PRESET_COLORS[0])

  function save() {
    if (endMs <= startMs) return
    onSave({ ...initial, name: name.trim() || initial.name, startMs, endMs, color })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-[360px] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-100">
            {isCreating ? 'Create Segment' : 'Edit Segment'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">
            ×
          </button>
        </div>

        {/* Name */}
        <div className="mb-3">
          <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">Name</label>
          <input
            autoFocus
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[12px] text-gray-100 outline-none focus:border-gray-500"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="success / loading / intro …"
          />
        </div>

        {/* Time range */}
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">Start (ms)</label>
            <CalculationNumberInput aria-label="start Ms"
              min={0}
              max={durationMs}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[12px] text-gray-100 outline-none focus:border-gray-500"
              value={startMs}
              onChange={(e) => setStartMs(Math.max(0, Number(e.target.value)))} onCalculate={calculated => setStartMs(Math.max(0, calculated))} />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">End (ms)</label>
            <CalculationNumberInput aria-label="end Ms"
              min={0}
              max={durationMs}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[12px] text-gray-100 outline-none focus:border-gray-500"
              value={endMs}
              onChange={(e) => setEndMs(Math.max(0, Number(e.target.value)))} onCalculate={calculated => setEndMs(Math.max(0, calculated))} />
          </div>
        </div>
        {endMs <= startMs && (
          <div className="mb-2 text-[10px] text-rose-400">End must be after start.</div>
        )}

        {/* Colour */}
        <div className="mb-4">
          <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">Colour</label>
          <div className="flex items-center gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-6 h-6 rounded ${color === c ? 'ring-2 ring-white' : ''}`}
                style={{ background: c }}
                title={c}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-6 h-6 rounded border border-gray-700 cursor-pointer bg-transparent"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          {!isCreating && onDelete ? (
            <button
              onClick={() => { onDelete(); onClose() }}
              className="text-[11px] text-rose-400 hover:text-rose-300"
            >
              Delete
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="text-[11px] px-3 py-1 rounded text-gray-300 hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={endMs <= startMs}
              className="text-[11px] px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isCreating ? 'Create' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
