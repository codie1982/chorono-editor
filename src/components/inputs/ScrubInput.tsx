'use client'
import { useEffect, useRef, useState } from 'react'

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
  title?: string
}

/**
 * Number input with horizontal scrub-drag behaviour (Blender / After Effects
 * style):
 *   - Press inside the input + drag right → value increases
 *   - Drag left → value decreases
 *   - A progress bar overlays the input showing the value within [min, max]
 *   - Bar persists 3s after release, then fades out
 *
 * Falls back to a normal `<input type="number">` for keyboard editing —
 * click-without-drag focuses the field as usual.
 *
 * Hold SHIFT while dragging for 10× sensitivity; ALT for 0.1× (fine adjust).
 */
export default function ScrubInput({
  value, onChange, min, max, step = 1,
  sensitivity, className = '',
  placeholder, disableScrub, title,
}: Props) {
  // Internal text state lets the user type "3.5" without React clobbering it
  // mid-edit. We commit on blur / Enter.
  const [text, setText] = useState<string>(String(value))
  useEffect(() => { setText(String(value)) }, [value])

  // Scrubber state
  const [scrubbing, setScrubbing] = useState(false)
  const [barVisible, setBarVisible] = useState(false)
  const dragRef = useRef<{ startX: number; startVal: number } | null>(null)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const movedRef = useRef(false)   // distinguish click-to-focus from drag

  // ── Drag math ──────────────────────────────────────────────────────────
  const handlePointerDown = (e: React.PointerEvent<HTMLInputElement>) => {
    if (disableScrub || e.button !== 0) return
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
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        title={title ?? 'Drag horizontally to scrub · Shift = 10× · Alt = 0.1×'}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const parsed = parseFloat(text)
          if (Number.isFinite(parsed)) onChange(parsed)
          else                          setText(String(value))
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') { setText(String(value)); (e.target as HTMLInputElement).blur() }
        }}
        className={`relative z-10 w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200
          focus:outline-none focus:border-blue-500
          ${scrubbing ? 'cursor-ew-resize select-none' : 'cursor-ew-resize'}
          ${className}`}
        style={{ touchAction: 'none' }}
      />
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
