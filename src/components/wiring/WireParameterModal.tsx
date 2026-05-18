'use client'
// ── WireParameterModal (BL-05) ────────────────────────────────────────────────
// Modal for creating + editing ParameterWires. Two side-by-side picker
// columns + an expression editor + a live preview row.
//
// Modes:
//   - "edit"  → existingWire supplied; fields prefilled; "Delete Wire" visible
//   - "new"   → preFilledTarget (optional) — PropertiesPanel 🔗 click sets this
//
// Apply commits via makeAddParameterWireCmd / makeUpdateParameterWireCmd so
// undo/redo works.

import { useEffect, useState, useMemo } from 'react'
import type { ChronoScene, ParameterRef, ParameterWire } from '@/lib/types'
import { newParameterWire } from '@/lib/defaults'
import {
  makeAddParameterWireCmd, makeUpdateParameterWireCmd, makeDeleteParameterWireCmd,
} from '@/lib/editor/commands-interactive'
import { safeEvaluate, parseExpression } from '@/lib/core/expression/expressionEvaluator'
import { formatParameterRef, areTypesCompatible } from '@/lib/wiring/helpers'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import SourceParameterPicker from './SourceParameterPicker'
import MappingPresets from './MappingPresets'

interface Props {
  scene: ChronoScene
  editor: EditorStateReturn
  /** When supplied, modal opens in EDIT mode and prefills from this wire. */
  existingWire?: ParameterWire | null
  /** Optional target prefilled when modal opens in NEW mode (PropertiesPanel
   *  click sets this). */
  preFilledTarget?: ParameterRef | null
  onClose: () => void
}

export default function WireParameterModal({
  scene, editor, existingWire, preFilledTarget, onClose,
}: Props) {
  const isEdit = !!existingWire
  const initialWire = existingWire ?? newParameterWire(
    preFilledTarget ? { target: preFilledTarget } : undefined,
  )

  const [source,     setSource]     = useState<ParameterRef | null>(initialWire.source.propertyPath ? initialWire.source : null)
  const [target,     setTarget]     = useState<ParameterRef | null>(initialWire.target.propertyPath ? initialWire.target : null)
  const [expression, setExpression] = useState(initialWire.expression)
  const [enabled,    setEnabled]    = useState(initialWire.enabled)
  const [clampOn,    setClampOn]    = useState(initialWire.clamp?.enabled ?? false)
  const [clampMin,   setClampMin]   = useState<string>(initialWire.clamp?.min != null ? String(initialWire.clamp.min) : '')
  const [clampMax,   setClampMax]   = useState<string>(initialWire.clamp?.max != null ? String(initialWire.clamp.max) : '')

  // Sync external changes (rare — usually modal owns state until apply)
  useEffect(() => {
    if (!existingWire) return
    setSource(existingWire.source)
    setTarget(existingWire.target)
    setExpression(existingWire.expression)
    setEnabled(existingWire.enabled)
    setClampOn(existingWire.clamp?.enabled ?? false)
    setClampMin(existingWire.clamp?.min != null ? String(existingWire.clamp.min) : '')
    setClampMax(existingWire.clamp?.max != null ? String(existingWire.clamp.max) : '')
  }, [existingWire])

  // Live preview — feed the current source value through the expression
  const { exprError, sourcePreview, result } = useMemo(() => {
    try { parseExpression(expression) }
    catch (e) {
      return {
        exprError: e instanceof Error ? e.message.replace(/^Parse error:\s*/, '') : 'Invalid expression',
        sourcePreview: null as number | null,
        result: null as number | null,
      }
    }
    const sv = source ? resolveSourceValue(scene, source) : null
    if (sv == null) {
      return { exprError: null, sourcePreview: null, result: null }
    }
    const r = safeEvaluate(expression, { source: sv, s: sv })
    return { exprError: null, sourcePreview: sv, result: r }
  }, [expression, source, scene])

  const typeMismatch = source && target && !areTypesCompatible(source.valueType, target.valueType)

  const canApply =
    source != null && target != null
    && (source.layerId !== target.layerId || source.propertyPath !== target.propertyPath)
    && expression.trim().length > 0
    && exprError == null

  function applyAndClose() {
    if (!canApply || !source || !target) return
    const clamp = clampOn
      ? {
          enabled: true,
          min: clampMin === '' ? undefined : Number(clampMin),
          max: clampMax === '' ? undefined : Number(clampMax),
        }
      : undefined
    const now = Date.now()
    if (isEdit && existingWire) {
      const next: ParameterWire = {
        ...existingWire,
        source, target, expression, enabled, clamp,
        updatedAt: now,
      }
      editor.dispatchCommand(makeUpdateParameterWireCmd(existingWire.id, existingWire, next))
    } else {
      const next = newParameterWire({
        source, target, expression, enabled, clamp,
      })
      editor.dispatchCommand(makeAddParameterWireCmd(next))
    }
    onClose()
  }

  function deleteAndClose() {
    if (!existingWire) return
    if (!window.confirm('Delete this wire? This can be undone with ⌘Z.')) return
    editor.dispatchCommand(makeDeleteParameterWireCmd(existingWire))
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-[820px] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-700 shrink-0">
          <h2 className="text-sm font-semibold text-gray-100">
            {isEdit ? '🔗 Edit Wire' : '🔗 Wire Parameter'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Source + target side-by-side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-amber-400 mb-1.5">Source</div>
              <SourceParameterPicker
                scene={scene}
                value={source}
                onChange={setSource}
                excludeRef={target}
                accentClass="text-amber-300"
              />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-emerald-400 mb-1.5">Target</div>
              <SourceParameterPicker
                scene={scene}
                value={target}
                onChange={setTarget}
                excludeRef={source}
                expectedType={source?.valueType}
                accentClass="text-emerald-300"
              />
            </div>
          </div>

          {typeMismatch && (
            <div className="text-[10px] text-amber-400 bg-amber-950/30 border border-amber-800/40 rounded px-2 py-1">
              ⚠ Type mismatch: source is <code>{source!.valueType}</code>, target expects <code>{target!.valueType}</code>.
              Make sure your expression converts it appropriately.
            </div>
          )}

          {/* Expression */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] uppercase tracking-wider text-sky-400">Expression</span>
              <MappingPresets expression={expression} onChange={setExpression} />
            </div>
            <input
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canApply) applyAndClose()
                if (e.key === 'Escape') onClose()
              }}
              placeholder="e.g. map(source, 0, 1, 0, 360)"
              spellCheck={false}
              className={`w-full bg-gray-950 border rounded px-2 py-1.5 text-[12px] font-mono outline-none focus:border-gray-500 ${
                exprError ? 'border-red-500 text-red-300' : 'border-gray-700 text-gray-100'
              }`}
            />
            {exprError && (
              <div className="text-[10px] text-red-400 px-1 mt-1">{exprError}</div>
            )}
          </div>

          {/* Preview */}
          <div className="bg-gray-950 border border-gray-800 rounded px-2 py-1.5 text-[11px] font-mono flex items-center gap-3">
            <span className="text-gray-500">preview:</span>
            {source == null ? (
              <span className="text-gray-600 italic">pick a source to preview</span>
            ) : sourcePreview == null ? (
              <span className="text-gray-600 italic">source has no current value</span>
            ) : (
              <>
                <span className="text-gray-500">source =</span>
                <span className="text-amber-300">{formatNum(sourcePreview)}</span>
                <span className="text-gray-600">→</span>
                <span className="text-emerald-300">{result == null ? '—' : formatNum(result)}</span>
              </>
            )}
          </div>

          {/* Options */}
          <div className="flex items-center gap-4 text-[11px] text-gray-300">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              Enabled
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={clampOn} onChange={(e) => setClampOn(e.target.checked)} />
              Clamp output
            </label>
            {clampOn && (
              <>
                <span className="text-gray-500 text-[10px]">min</span>
                <input
                  type="number" value={clampMin}
                  onChange={(e) => setClampMin(e.target.value)}
                  className="w-16 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[11px] text-gray-100 font-mono outline-none"
                />
                <span className="text-gray-500 text-[10px]">max</span>
                <input
                  type="number" value={clampMax}
                  onChange={(e) => setClampMax(e.target.value)}
                  className="w-16 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[11px] text-gray-100 font-mono outline-none"
                />
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-700 shrink-0">
          <div>
            {isEdit && (
              <button
                onClick={deleteAndClose}
                className="px-3 py-1 text-[11px] rounded bg-red-900/40 hover:bg-red-800/60 text-red-300 border border-red-800/40"
              >
                Delete Wire
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1 text-[11px] rounded bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={applyAndClose}
              disabled={!canApply}
              className="px-3 py-1 text-[11px] rounded bg-sky-700 hover:bg-sky-600 text-white border border-sky-500 disabled:opacity-40 disabled:cursor-not-allowed"
              title={!canApply ? 'Pick source + target + a valid expression' : 'Apply'}
            >
              {isEdit ? 'Apply Changes' : 'Create Wire'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Preview helper — resolve a source value at modal-open time (static fallback,
// no live override map; preview only shows magnitude).
// ─────────────────────────────────────────────────────────────────────────────

function resolveSourceValue(scene: ChronoScene, ref: ParameterRef): number | null {
  if (!ref.layerId) {
    const p = scene.parameters.find((pp) => pp.id === ref.propertyPath)
    if (!p) return null
    const v = p.defaultValue
    if (typeof v === 'number')  return v
    if (typeof v === 'boolean') return v ? 1 : 0
    if (typeof v === 'string') { const n = Number(v); return Number.isFinite(n) ? n : null }
    return null
  }
  const layer = scene.layers.find((l) => l.id === ref.layerId)
  if (!layer) return null
  let cursor: unknown = layer
  for (const seg of ref.propertyPath.split('.')) {
    if (cursor == null || typeof cursor !== 'object') return null
    cursor = (cursor as Record<string, unknown>)[seg]
  }
  return typeof cursor === 'number' ? cursor : null
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return String(n)
  if (Math.abs(n) >= 1000) return n.toFixed(0)
  if (Math.abs(n) >= 1)    return n.toFixed(2)
  return n.toFixed(4)
}

