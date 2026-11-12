'use client'
import { useEffect, useRef, useState } from 'react'
import { useNumericPropertyInput } from './expressions/NumericPropertyContext'
import { CalculationButton } from './expressions/CalculationButton'
import { PropertyFormulaEditor } from './expressions/PropertyFormulaEditor'
import { inspectNumericLiteral, numericInputExpression } from '@/lib/editor/inputExpressions/NumericInputExpression'
import { numericPropertyConstraints } from '@/lib/expression/properties/NumericPropertyCapability'

interface Props {
  value:     number
  onChange:  (v: number) => void
  min?:      number
  max?:      number
  step?:     number
  /**
   * How many UNITS the value moves per ONE CSS pixel of horizontal mouse
   * movement. Default = step (so dragging 1px == one step). Larger values
   * make the scrubber faster.
   */
  sensitivity?: number
  /** Extra classes for the input element. */
  className?: string
  placeholder?: string
  /** Disable the scrub-drag behaviour but keep keyboard editing. */
  disableScrub?: boolean
  disabled?: boolean
  title?: string
  /** Explicit owning numeric source path; schema scopes may supply it instead. */
  propertyPath?: string
  fieldLabel?: string
}

/**
 * Number input with horizontal scrub-drag behaviour (Blender / After Effects
 * style):
 *   - Press inside the input + drag right → value increases
 *   - Drag left → value decreases
 *   - A progress bar overlays the input showing the value within [min, max]
 *   - Bar persists 3s after release, then fades out
 *
 * Typed text is a local draft committed once on blur/Enter; untouched blur and
 * Escape never dispatch a value. An external controlled-value change discards
 * that draft, preserving the component's existing external-update policy.
 * Registered numeric fields expose fx/double-click for a saved constant formula;
 * a saved recipe makes the literal read-only until explicit Convert to value.
 * Full-string/bounds errors keep the draft and previous source unchanged.
 * Click-without-drag focuses the decimal text field as usual.
 *
 * Hold SHIFT while dragging for 10× sensitivity; ALT for 0.1× (fine adjust).
 */
export default function ScrubInput({
  value, onChange, min, max, step = 1,
  sensitivity, className = '',
  placeholder, disableScrub, disabled, title, propertyPath, fieldLabel,
}: Props) {
  const candidate = useNumericPropertyInput(propertyPath, fieldLabel)
  let property = candidate
  try { if (candidate?.layer) numericPropertyConstraints(candidate.layer, candidate.path) } catch { property = null }
  const owner = property?.layer
  const saved = owner && property ? numericInputExpression(owner, property.path) : undefined
  const live = owner && property ? owner.propertyExpressions?.fields[property.path] : undefined
  const frameKey = property ? 'layers.' + property.layerId + '.' + property.path : ''
  const evaluated = live && property?.frame?.overrides.get(frameKey)
  const shownValue = typeof evaluated === 'number' ? evaluated : value
  const liveError = live && (property?.frame?.expressionErrors?.get(frameKey) ?? property?.frame?.expressionErrors?.get('scene'))
  const propertyKey = property ? JSON.stringify([property.layerId, property.path]) : ''
  const [formulaEditor, setFormulaEditor] = useState<{ target: string; formula?: string } | null>(null)
  // A selection/path change closes the old draft instead of retargeting it.
  useEffect(() => { setFormulaEditor(null) }, [propertyKey])
  const [error, setError] = useState('')
  // Internal text state lets the user type "3.5" without React clobbering it
  // mid-edit. We commit on blur / Enter.
  const [text, setText] = useState<string>(String(shownValue))
  const dirtyRef = useRef(false)
  const latest = useRef({ value: shownValue, onChange, propertyKey })
  // Invalidate a typed draft before effects as well: blur can arrive between
  // an external value's render and its passive text-sync effect.
  if (!Object.is(latest.current.value, shownValue) || latest.current.propertyKey !== propertyKey) dirtyRef.current = false
  latest.current = { value: shownValue, onChange, propertyKey }
  useEffect(() => { dirtyRef.current = false; setText(String(shownValue)); setError('') }, [shownValue, propertyKey])

  /** Open only this source field, carrying any uncommitted/invalid typed draft.
   * Clear blur ownership before native modal focus moves away from the input. */
  const openFormula = () => {
    if (!property) return
    setFormulaEditor({ target: propertyKey, formula: dirtyRef.current || error ? text : undefined })
    dirtyRef.current = false; setText(String(shownValue)); setError('')
  }

  /** Commit only a changed, finite typed draft. Clear ownership before invoking
   * the controlled callback, so Enter + blur or synchronous rerenders cannot
   * dispatch the same edit twice or overwrite a later viewport/source update. */
  const handleBlur = () => {
    if (!dirtyRef.current) return
    dirtyRef.current = false
    const result = inspectNumericLiteral(text, { min, max }), current = latest.current
    setError(result.error ?? '')
    if (result.value !== null && result.value !== current.value) current.onChange(result.value)
    else if (!result.error) setText(String(current.value))
  }

  // Scrubber state
  const [scrubbing, setScrubbing] = useState(false)
  const [barVisible, setBarVisible] = useState(false)
  const dragRef = useRef<{ startX: number; startVal: number } | null>(null)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const movedRef = useRef(false)   // distinguish click-to-focus from drag

  // ── Drag math ──────────────────────────────────────────────────────────
  const handlePointerDown = (e: React.PointerEvent<HTMLInputElement>) => {
    if (disableScrub || saved || live || e.button !== 0) return
    // If the input already has focus, don't start a scrub — let user edit text.
    if (document.activeElement === e.currentTarget) return

    dragRef.current = { startX: e.clientX, startVal: Number(value) || 0 }
    movedRef.current = false
    // Capture pointer so we get move/up even if user drags off the input.
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLInputElement>) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    // Only count as a drag after 2px movement (lets a tiny shake count as click)
    if (Math.abs(dx) < 2 && !movedRef.current) return
    movedRef.current = true
    if (!scrubbing) {
      setScrubbing(true)
      setBarVisible(true)
      // Cancel any pending fade-out from a previous scrub
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current)
        fadeTimerRef.current = null
      }
    }

    // Sensitivity: default = step. Shift = 10×, Alt = 0.1×.
    let perPx = sensitivity ?? step
    if (e.shiftKey)  perPx *= 10
    if (e.altKey)    perPx *= 0.1

    let next = dragRef.current.startVal + dx * perPx
    if (step > 0) next = Math.round(next / step) * step
    if (min !== undefined) next = Math.max(min, next)
    if (max !== undefined) next = Math.min(max, next)
    onChange(next)
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLInputElement>) => {
    if (!dragRef.current) return
    const wasScrubbing = scrubbing
    dragRef.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    setScrubbing(false)

    if (wasScrubbing) {
      // Keep bar visible for 3s, then fade out
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
      fadeTimerRef.current = setTimeout(() => {
        setBarVisible(false)
        fadeTimerRef.current = null
      }, 3000)
      // Prevent the click-to-focus default so we don't open the keyboard cursor
      e.preventDefault()
    }
  }

  // Cleanup pending timers on unmount
  useEffect(() => {
    return () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
    }
  }, [])

  // ── Progress bar fill ratio ────────────────────────────────────────────
  const lo = min ?? 0
  const hi = max ?? Math.max(100, Math.abs(Number(value)) * 2 || 100)
  const span = hi - lo
  const pct = span > 0
    ? Math.max(0, Math.min(1, (Number(value) - lo) / span)) * 100
    : 50

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="relative w-full">
      <input
        type="text"
        disabled={disabled}
        inputMode="decimal"
        aria-label={property?.label ?? fieldLabel}
        readOnly={!!saved || !!live}
        aria-invalid={!!error || !!liveError}
        onDoubleClick={event => {
          if (!property) return
          event.preventDefault(); event.stopPropagation()
          openFormula()
        }}
        value={text}
        placeholder={placeholder}
        title={title ?? 'Drag horizontally to scrub · Shift = 10× · Alt = 0.1×'}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onChange={(e) => { dirtyRef.current = true; setText(e.target.value); setError('') }}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); e.currentTarget.blur() }
          if (e.key === 'Escape') {
            e.preventDefault(); e.stopPropagation(); setError('')
            dirtyRef.current = false
            setText(String(latest.current.value))
            e.currentTarget.blur()
          }
        }}
        className={`relative z-10 w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200
          focus:outline-none focus:border-blue-500
          ${scrubbing ? 'cursor-ew-resize select-none' : 'cursor-ew-resize'}
          ${property || !candidate ? 'pr-8' : ''} ${saved || live ? 'text-violet-200' : ''} ${className}`}
        style={{ touchAction: 'none' }}
      />
      {property && <button type="button" aria-label={`Edit expression for ${property.label}`} title={live ? `Live formula: ${live.formula}` : saved ? `Saved formula: ${saved.formula}` : 'Edit a numeric formula'}
        onMouseDown={event => event.preventDefault()} onClick={event => { event.preventDefault(); event.stopPropagation(); openFormula() }}
        className={`absolute right-0 top-0 z-20 h-7 w-8 rounded-r text-xs focus-visible:outline focus-visible:outline-blue-400 ${saved || live ? 'text-violet-200 bg-violet-900/50' : 'text-gray-400 hover:bg-gray-700'}`}>fx</button>}
      {!candidate && <span className="absolute right-0 top-0 z-20"><CalculationButton label={fieldLabel ?? placeholder ?? 'value'} value={shownValue} kind="number" min={min} max={max} disabled={disabled} onResult={result => onChange(result as number)} /></span>}
      {!live && saved && saved.value !== value && <p className="mt-1 text-[11px] text-amber-300">Source changed; formula was not reapplied.</p>}
      {liveError && <p role="alert" className="mt-1 text-[11px] text-amber-300">{liveError}</p>}
      {error && <p role="alert" className="mt-1 text-[11px] text-amber-300">{error}</p>}
      {formulaEditor && formulaEditor.target === propertyKey && property && <PropertyFormulaEditor key={propertyKey} input={property} limits={{ min, max }} initialFormula={formulaEditor.formula} onClose={() => setFormulaEditor(null)} />}
      {/* Progress bar overlay — z-0 so it sits BEHIND the text */}
      {barVisible && (
        <div
          className={`absolute left-0 bottom-0 h-[3px] rounded-b transition-opacity duration-700 ${scrubbing ? 'opacity-90' : 'opacity-60'}`}
          style={{
            width: `${pct}%`,
            background: scrubbing
              ? 'linear-gradient(90deg, #3B82F6, #60A5FA)'
              : 'linear-gradient(90deg, #2563EB, #60A5FA)',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  )
}
