'use client'
// ── CloneModal (BL-59) ────────────────────────────────────────────────────────
//
// "Clone with settings…" dialog. Quick Clone (Cmd+D) is fired straight
// from the context menu; this modal opens when the user wants to choose
// count + offset + animation toggle in a single dispatch.

import { useState } from 'react'
import type { Layer } from '@/lib/types'
import type { CloneMode } from '@/lib/clone/CloneTypes'

interface Props {
  source:                Layer
  /** Whether the active timeline has any tracks targeting `source`. Used
   *  to enable / disable the "duplicate animation" checkbox. */
  hasAnimationOnSource:  boolean
  onApply:               (params: CloneApplyParams) => void
  onClose:               () => void
}

export interface CloneApplyParams {
  count: number
  offsetX: number
  offsetY: number
  duplicateAnimation: boolean
  mode: CloneMode
}

const MIN_COUNT  = 1
const MAX_COUNT  = 200
const MIN_OFFSET = -2000
const MAX_OFFSET = 2000

export default function CloneModal({
  source, hasAnimationOnSource, onApply, onClose,
}: Props) {
  const [count,   setCount]   = useState(1)
  const [offsetX, setOffsetX] = useState(20)
  const [offsetY, setOffsetY] = useState(20)
  const [dupAnim, setDupAnim] = useState(true)
  const [mode,    setMode]    = useState<CloneMode>('copy')

  const validCount = count >= MIN_COUNT && count <= MAX_COUNT
  const canApply   = validCount

  function apply() {
    if (!canApply) return
    onApply({
      count,
      offsetX,
      offsetY,
      duplicateAnimation: dupAnim,
      mode,
    })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-[380px] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-100">
            Clone &ldquo;{source.name}&rdquo;
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Clone Mode — Copy + Instance enabled (Reference/Virtual Phase 3) */}
        <div className="mb-3">
          <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">
            Mode
          </label>
          <div className="grid grid-cols-4 gap-1">
            <ModePill label="Copy"
              active={mode === 'copy'}
              disabled={false}
              onClick={() => setMode('copy')}
            />
            <ModePill label="Instance"
              active={mode === 'instance'}
              disabled={false}
              onClick={() => setMode('instance')}
            />
            <ModePill label="Reference" active={false} disabled />
            <ModePill label="Virtual"   active={false} disabled />
          </div>
          <div className="mt-1 text-[10px] text-gray-600 italic">
            {mode === 'copy' && 'Independent deep copy. Editing source has no effect.'}
            {mode === 'instance' && 'Tagged copy — linked to source via metadata (Phase 3 hot-swap render).'}
          </div>
        </div>

        {/* Count */}
        <div className="mb-3">
          <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">
            Number of clones
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={MIN_COUNT}
              max={Math.min(50, MAX_COUNT)}
              value={Math.min(count, 50)}
              onChange={(e) => setCount(Number(e.target.value))}
              className="flex-1 accent-blue-500"
            />
            <input
              type="number"
              min={MIN_COUNT}
              max={MAX_COUNT}
              value={count}
              onChange={(e) => setCount(Math.max(MIN_COUNT, Math.min(MAX_COUNT, Number(e.target.value))))}
              className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[12px] text-gray-100 outline-none focus:border-gray-500"
            />
          </div>
          {!validCount && (
            <div className="mt-1 text-[10px] text-rose-400">
              Count must be between {MIN_COUNT} and {MAX_COUNT}.
            </div>
          )}
        </div>

        {/* Offset */}
        <div className="mb-3 grid grid-cols-2 gap-2">
          <NumberField
            label="Offset X (px)"
            value={offsetX}
            onChange={setOffsetX}
            min={MIN_OFFSET}
            max={MAX_OFFSET}
          />
          <NumberField
            label="Offset Y (px)"
            value={offsetY}
            onChange={setOffsetY}
            min={MIN_OFFSET}
            max={MAX_OFFSET}
          />
        </div>
        <div className="-mt-1 mb-3 text-[10px] text-gray-600">
          Offset is applied per-clone (clone #N sits at N × offset from the source).
        </div>

        {/* Animation duplication */}
        <div className="mb-4">
          <label className="flex items-center gap-2 text-[11px] text-gray-300">
            <input
              type="checkbox"
              checked={dupAnim}
              disabled={!hasAnimationOnSource}
              onChange={(e) => setDupAnim(e.target.checked)}
              className="accent-blue-500"
            />
            <span className={hasAnimationOnSource ? '' : 'text-gray-600'}>
              Duplicate animation tracks
              {!hasAnimationOnSource && (
                <span className="ml-1 text-gray-600 italic">(no tracks on source)</span>
              )}
            </span>
          </label>
        </div>

        {/* Summary */}
        <div className="mb-4 px-3 py-2 bg-gray-800/50 border border-gray-800 rounded text-[11px] text-gray-400">
          Will create <span className="text-gray-200 font-medium">{count}</span> new layer
          {count === 1 ? '' : 's'}
          {dupAnim && hasAnimationOnSource && ' + duplicate animation'}.
          One undo step.
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="text-[11px] px-3 py-1 rounded text-gray-300 hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={apply}
            disabled={!canApply}
            className="text-[11px] px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Clone
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Subcomponents ───────────────────────────────────────────────────────────

function ModePill({
  label, active, disabled, onClick,
}: {
  label: string
  active: boolean
  disabled: boolean
  onClick?: () => void
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={
        'text-[10px] px-2 py-1 rounded border transition-colors ' +
        (active
          ? 'bg-blue-600 border-blue-500 text-white'
          : disabled
            ? 'bg-gray-900 border-gray-800 text-gray-600 cursor-not-allowed'
            : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500')
      }
    >
      {label}
    </button>
  )
}

function NumberField({
  label, value, onChange, min, max, step = 1,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  step?: number
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">
        {label}
      </label>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(n)
        }}
        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[12px] text-gray-100 outline-none focus:border-gray-500"
      />
    </div>
  )
}
