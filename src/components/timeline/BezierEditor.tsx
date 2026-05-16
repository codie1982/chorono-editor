'use client'
import { useCallback, useRef } from 'react'

interface Bezier { cx1: number; cy1: number; cx2: number; cy2: number }

interface Props {
  value: Bezier
  onChange: (next: Bezier) => void
}

const SIZE      = 140      // SVG width/height in CSS px
const PAD       = 12       // padding so handles stay inside the box
const PLOT_SIZE = SIZE - PAD * 2

// ── Curve presets ────────────────────────────────────────────────────────────
const PRESETS: { name: string; value: Bezier }[] = [
  { name: 'Linear',    value: { cx1: 0.00, cy1: 0.00, cx2: 1.00, cy2: 1.00 } },
  { name: 'Ease',      value: { cx1: 0.25, cy1: 0.10, cx2: 0.25, cy2: 1.00 } },
  { name: 'Ease-In',   value: { cx1: 0.42, cy1: 0.00, cx2: 1.00, cy2: 1.00 } },
  { name: 'Ease-Out',  value: { cx1: 0.00, cy1: 0.00, cx2: 0.58, cy2: 1.00 } },
  { name: 'Ease-Both', value: { cx1: 0.42, cy1: 0.00, cx2: 0.58, cy2: 1.00 } },
  { name: 'Bounce',    value: { cx1: 0.68, cy1: -0.55, cx2: 0.27, cy2: 1.55 } },
]

// ── Coord mapping ────────────────────────────────────────────────────────────
// SVG y grows downward — flip so 1.0 (full progress) is at the top.
function toScreen(v: number, axis: 'x' | 'y'): number {
  return axis === 'x' ? PAD + v * PLOT_SIZE : PAD + (1 - v) * PLOT_SIZE
}
function fromScreen(px: number, axis: 'x' | 'y'): number {
  const v = (px - PAD) / PLOT_SIZE
  // Allow handles to extend slightly past 0/1 for bounce/overshoot (-0.5 → 1.5)
  return axis === 'x'
    ? Math.max(0, Math.min(1, v))     // X clamped to [0,1] — must be monotone
    : Math.max(-0.5, Math.min(1.5, axis === 'y' ? 1 - v : v))
}

/**
 * Interactive cubic-bezier editor.
 *  - Drag P1 (orange) and P2 (cyan) to shape the curve
 *  - The X coordinate of a handle is constrained to [0,1] to keep the curve
 *    monotonic in time; Y can over/under-shoot for bounce-style easings.
 *  - Six built-in presets sit below.
 */
export default function BezierEditor({ value, onChange }: Props) {
  const svgRef     = useRef<SVGSVGElement>(null)
  const draggingRef = useRef<'p1' | 'p2' | null>(null)

  const beginDrag = useCallback((handle: 'p1' | 'p2') => (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    ;(e.currentTarget as SVGElement).setPointerCapture(e.pointerId)
    draggingRef.current = handle
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current) return
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width)  * SIZE
    const py = ((e.clientY - rect.top)  / rect.height) * SIZE
    const x = fromScreen(px, 'x')
    const y = fromScreen(py, 'y')

    if (draggingRef.current === 'p1') {
      onChange({ ...value, cx1: x, cy1: y })
    } else {
      onChange({ ...value, cx2: x, cy2: y })
    }
  }, [onChange, value])

  const endDrag = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return
    draggingRef.current = null
    try { (e.currentTarget as SVGElement).releasePointerCapture(e.pointerId) } catch { /* */ }
  }, [])

  // Build the SVG path: M (start) → C (cx1,cy1) (cx2,cy2) (end)
  const p0x = toScreen(0, 'x'), p0y = toScreen(0, 'y')
  const p3x = toScreen(1, 'x'), p3y = toScreen(1, 'y')
  const p1x = toScreen(value.cx1, 'x'), p1y = toScreen(value.cy1, 'y')
  const p2x = toScreen(value.cx2, 'x'), p2y = toScreen(value.cy2, 'y')
  const d = `M ${p0x} ${p0y} C ${p1x} ${p1y} ${p2x} ${p2y} ${p3x} ${p3y}`

  return (
    <div className="flex flex-col gap-2">
      <svg
        ref={svgRef}
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="bg-gray-900 border border-gray-700 rounded select-none"
      >
        {/* Grid */}
        <rect x={PAD} y={PAD} width={PLOT_SIZE} height={PLOT_SIZE} fill="none" stroke="#374151" />
        {[0.25, 0.5, 0.75].map((g) => (
          <g key={g} stroke="#1f2937" strokeWidth={1}>
            <line x1={toScreen(g, 'x')} y1={PAD} x2={toScreen(g, 'x')} y2={PAD + PLOT_SIZE} />
            <line x1={PAD} y1={toScreen(g, 'y')} x2={PAD + PLOT_SIZE} y2={toScreen(g, 'y')} />
          </g>
        ))}

        {/* Diagonal reference (= linear easing) */}
        <line x1={p0x} y1={p0y} x2={p3x} y2={p3y} stroke="#374151" strokeDasharray="3 3" />

        {/* Handle leashes */}
        <line x1={p0x} y1={p0y} x2={p1x} y2={p1y} stroke="#FB923C" strokeWidth={1} />
        <line x1={p3x} y1={p3y} x2={p2x} y2={p2y} stroke="#22D3EE" strokeWidth={1} />

        {/* Curve */}
        <path d={d} fill="none" stroke="#FBBF24" strokeWidth={2} />

        {/* Endpoints (non-interactive) */}
        <circle cx={p0x} cy={p0y} r={3} fill="#6B7280" />
        <circle cx={p3x} cy={p3y} r={3} fill="#6B7280" />

        {/* P1 handle (draggable, orange) */}
        <circle
          cx={p1x} cy={p1y} r={6}
          fill="#FB923C" stroke="#7C2D12" strokeWidth={1.5}
          className="cursor-grab active:cursor-grabbing"
          onPointerDown={beginDrag('p1')}
        />
        {/* P2 handle (draggable, cyan) */}
        <circle
          cx={p2x} cy={p2y} r={6}
          fill="#22D3EE" stroke="#155E75" strokeWidth={1.5}
          className="cursor-grab active:cursor-grabbing"
          onPointerDown={beginDrag('p2')}
        />
      </svg>

      {/* Presets */}
      <div className="grid grid-cols-3 gap-1">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            onClick={() => onChange(p.value)}
            className="text-[10px] px-1.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300
                       border border-gray-700 hover:border-gray-600 transition-colors"
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Numeric readout */}
      <div className="font-mono text-[9px] text-gray-500 text-center tracking-tight">
        cubic-bezier({value.cx1.toFixed(2)}, {value.cy1.toFixed(2)}, {value.cx2.toFixed(2)}, {value.cy2.toFixed(2)})
      </div>
    </div>
  )
}
