'use client'
import { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import type { ChronoScene, Track, Layer } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import {
  pickTrackColor, unionValueRange, buildCurvePath,
  msToX, valueToY, pickTimeTickMs, pickValueTick, formatTickValue,
  type CurveViewport, type ValueRange,
} from '@/lib/timeline/curveMath'
import { useCurveDrag } from './hooks/useCurveDrag'

interface Props {
  scene:              ChronoScene
  editor:             EditorStateReturn
  selectedLayerId:    string | null
  selectedTimelineId: string | null
  currentTimeMs:      number
  onTimeChange:       (ms: number) => void
  selectedKfIds:      Set<string>
  onSelectKeyframes:  (next: Set<string>) => void
}

const LEFT_GUTTER  = 110   // px reserved for the property name + Y-axis labels
const TOP_GUTTER   = 24    // px reserved for X-axis labels
const BOTTOM_PAD   = 16

/**
 * 3ds Max / After Effects-style curve editor.
 *
 * Shows every animated property of the selected layer as a colour-coded
 * curve on a shared time × value plot. Click anywhere on the plot to seek;
 * drag a keyframe node to retime (X) or revalue (Y) it in real time. Bezier
 * tangent handles for fully custom easing are a follow-up — for now, the
 * built-in easing types (linear / ease* / customBezier) are reflected in
 * the sampled curve so the picture matches playback exactly.
 *
 * Non-numeric tracks (string / boolean / color) are hidden — they don't
 * have a meaningful value axis. Add a key in the timeline panel first.
 */
export default function CurveEditor({
  scene, editor, selectedLayerId, selectedTimelineId,
  currentTimeMs, onTimeChange, selectedKfIds, onSelectKeyframes,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef       = useRef<SVGSVGElement>(null)

  const timeline = scene.timelines.find((t) => t.id === selectedTimelineId) ?? null
  const layer    = scene.layers.find((l) => l.id === selectedLayerId) ?? null
  const duration = timeline?.durationMs ?? scene.composition.durationMs

  // ── Track set: every numeric track on the selected layer ─────────────────
  const tracks: Track[] = useMemo(() => {
    if (!timeline || !layer) return []
    const prefix = `layers.${layer.id}.`
    return timeline.tracks.filter((t) =>
      t.target.startsWith(prefix) &&
      t.keyframes.length > 0 &&
      typeof t.keyframes[0].value === 'number',
    )
  }, [timeline, layer])

  // ── Per-track visibility toggle (3ds Max-style: click curve name to hide) ─
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const visibleTracks = useMemo(
    () => tracks.filter((t) => !hidden.has(t.target)),
    [tracks, hidden],
  )

  // ── Size observation (SVG fills its container) ────────────────────────────
  const [size, setSize] = useState({ w: 600, h: 320 })
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      setSize({ w: Math.max(200, r.width), h: Math.max(160, r.height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── Time/value viewport ───────────────────────────────────────────────────
  const [viewStartMs, setViewStartMs] = useState(0)
  const [viewEndMs,   setViewEndMs]   = useState(duration)

  // Re-fit the X axis when timeline duration changes
  useEffect(() => { setViewStartMs(0); setViewEndMs(duration) }, [duration])

  const range: ValueRange = useMemo(
    () => unionValueRange(visibleTracks) ?? { min: -1, max: 1 },
    [visibleTracks],
  )

  const plotW = Math.max(50, size.w - LEFT_GUTTER - 8)
  const plotH = Math.max(50, size.h - TOP_GUTTER - BOTTOM_PAD)
  const viewport: CurveViewport = {
    startMs: viewStartMs, endMs: viewEndMs,
    range, widthPx: plotW, heightPx: plotH,
  }

  // ── Pointer mapping (client → SVG-plot-local) ─────────────────────────────
  const clientToLocal = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    return {
      x: clientX - rect.left - LEFT_GUTTER,
      y: clientY - rect.top  - TOP_GUTTER,
    }
  }, [])

  // ── Drag controller ───────────────────────────────────────────────────────
  const drag = useCurveDrag({
    scene, editor, viewport,
    timelineId: selectedTimelineId, clientToLocal,
  })

  // Global pointermove / pointerup once a drag is active. Single effect
  // (rather than per-node listeners) avoids handler-ordering races during
  // multi-track interaction.
  useEffect(() => {
    if (!drag.isDragging) return
    const onMove = (e: PointerEvent) => drag.move(e)
    const onUp   = ()              => drag.end()
    const onKey  = (e: KeyboardEvent) => { if (e.key === 'Escape') drag.cancel() }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup',   onUp)
    window.addEventListener('keydown',     onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup',   onUp)
      window.removeEventListener('keydown',     onKey)
    }
  }, [drag])

  // ── Click-to-seek on empty plot space ─────────────────────────────────────
  const onPlotClick = (e: React.PointerEvent<SVGRectElement>) => {
    const { x } = clientToLocal(e.clientX, e.clientY)
    const ms = viewStartMs + (x / plotW) * Math.max(1, viewEndMs - viewStartMs)
    onTimeChange(Math.max(0, Math.min(duration, ms)))
  }

  // ── Zoom / pan on the plot via wheel ──────────────────────────────────────
  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    if (e.shiftKey) {
      // Horizontal pan
      const span = viewEndMs - viewStartMs
      const dx   = (e.deltaY / plotW) * span
      const clamped = clampWindow(viewStartMs + dx, viewEndMs + dx, duration)
      setViewStartMs(clamped.s); setViewEndMs(clamped.e)
    } else {
      // Zoom around cursor
      const { x } = clientToLocal(e.clientX, e.clientY)
      const cursorMs = viewStartMs + (x / plotW) * (viewEndMs - viewStartMs)
      const factor   = e.deltaY > 0 ? 1.15 : 0.85
      const newSpan  = Math.max(50, (viewEndMs - viewStartMs) * factor)
      const ratio    = (cursorMs - viewStartMs) / (viewEndMs - viewStartMs || 1)
      const s = cursorMs - ratio * newSpan
      const ev = s + newSpan
      const clamped = clampWindow(s, ev, duration)
      setViewStartMs(clamped.s); setViewEndMs(clamped.e)
    }
  }

  // ── Ticks ─────────────────────────────────────────────────────────────────
  const timeTick  = pickTimeTickMs(viewEndMs - viewStartMs)
  const valueTick = pickValueTick(range)
  const timeTicks  = niceTickArray(viewStartMs, viewEndMs, timeTick)
  const valueTicks = niceTickArray(range.min,  range.max,  valueTick)

  // ── Empty states ──────────────────────────────────────────────────────────
  if (!layer) return (
    <Empty msg="Select a layer to inspect its animation curves." />
  )
  if (!timeline) return (
    <Empty msg="No timeline selected." />
  )
  if (tracks.length === 0) return (
    <Empty msg={`"${layer.name}" has no animated numeric properties yet.`} />
  )

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="flex flex-col h-full bg-gray-950 relative overflow-hidden">

      {/* Top bar — track legend / visibility toggles */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-gray-800 bg-gray-900/70 shrink-0">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mr-2">
          Curves
        </span>
        {tracks.map((t, i) => {
          const color = pickTrackColor(t.target, i)
          const isHidden = hidden.has(t.target)
          const label = t.target.replace(`layers.${layer.id}.`, '')
          return (
            <button
              key={t.target}
              onClick={() => setHidden((prev) => {
                const next = new Set(prev)
                if (next.has(t.target)) next.delete(t.target)
                else                    next.add(t.target)
                return next
              })}
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded transition-opacity ${
                isHidden ? 'opacity-30 hover:opacity-60' : 'opacity-100'
              } hover:bg-gray-800`}
              title={isHidden ? 'Show this curve' : 'Hide this curve'}
            >
              <span style={{ color }}>■</span>
              <span className="ml-1 text-gray-300">{label}</span>
            </button>
          )
        })}
      </div>

      <svg
        ref={svgRef}
        width={size.w} height={size.h}
        className="block flex-1 cursor-crosshair select-none"
        onWheel={onWheel}
      >
        {/* ── Left gutter: Y-axis value labels ─────────────────────────── */}
        {valueTicks.map((v, i) => {
          const y = TOP_GUTTER + valueToY(viewport, v)
          return (
            <g key={`vt-${i}`}>
              <line x1={LEFT_GUTTER - 4} x2={LEFT_GUTTER} y1={y} y2={y} stroke="#4b5563" />
              <text x={LEFT_GUTTER - 6} y={y + 3} textAnchor="end"
                fontSize="9" fill="#9ca3af" fontFamily="monospace">
                {formatTickValue(v)}
              </text>
              <line
                x1={LEFT_GUTTER} x2={LEFT_GUTTER + plotW}
                y1={y} y2={y}
                stroke="#1f2937" strokeDasharray="2 4"
              />
            </g>
          )
        })}

        {/* ── Top gutter: X-axis time labels ───────────────────────────── */}
        {timeTicks.map((tMs, i) => {
          const x = LEFT_GUTTER + msToX(viewport, tMs)
          return (
            <g key={`tt-${i}`}>
              <line x1={x} x2={x} y1={TOP_GUTTER - 4} y2={TOP_GUTTER} stroke="#4b5563" />
              <text x={x} y={TOP_GUTTER - 6} textAnchor="middle"
                fontSize="9" fill="#9ca3af" fontFamily="monospace">
                {formatTimeMs(tMs)}
              </text>
              <line
                x1={x} x2={x}
                y1={TOP_GUTTER} y2={TOP_GUTTER + plotH}
                stroke="#1f2937" strokeDasharray="2 4"
              />
            </g>
          )
        })}

        {/* ── Plot background hit-target for click-to-seek ─────────────── */}
        <rect
          x={LEFT_GUTTER} y={TOP_GUTTER}
          width={plotW} height={plotH}
          fill="transparent"
          onPointerDown={(e) => { if (e.button === 0 && !drag.isDragging) onPlotClick(e) }}
        />

        {/* ── Zero-line (where value = 0) — bold so origin is obvious ── */}
        {range.min < 0 && range.max > 0 && (
          <line
            x1={LEFT_GUTTER} x2={LEFT_GUTTER + plotW}
            y1={TOP_GUTTER + valueToY(viewport, 0)}
            y2={TOP_GUTTER + valueToY(viewport, 0)}
            stroke="#374151" strokeWidth={1}
          />
        )}

        {/* ── Curves ───────────────────────────────────────────────────── */}
        <g transform={`translate(${LEFT_GUTTER} ${TOP_GUTTER})`}>
          {visibleTracks.map((t, i) => {
            const color = pickTrackColor(t.target, i)
            const d = buildCurvePath(t, viewport)
            return (
              <path
                key={t.target} d={d}
                fill="none" stroke={color}
                strokeWidth={1.5} opacity={0.95}
              />
            )
          })}
        </g>

        {/* ── Keyframe nodes ───────────────────────────────────────────── */}
        <g transform={`translate(${LEFT_GUTTER} ${TOP_GUTTER})`}>
          {visibleTracks.flatMap((t, i) => {
            const color = pickTrackColor(t.target, i)
            return t.keyframes.map((kf) => {
              const isDragged = drag.preview != null && drag.isDragging
                                && drag.preview.value === kf.value && drag.preview.ms === kf.timeMs
              const ms  = isDragged ? drag.preview!.ms    : kf.timeMs
              const val = isDragged ? drag.preview!.value : (kf.value as number)
              const cx = msToX(viewport, ms)
              const cy = valueToY(viewport, val)
              const isSelected = selectedKfIds.has(kf.id)
              return (
                <g key={`${t.target}-${kf.id}`}>
                  <circle
                    cx={cx} cy={cy}
                    r={isSelected ? 5 : 4}
                    fill={isSelected ? '#fff' : color}
                    stroke={color}
                    strokeWidth={isSelected ? 2 : 1}
                    style={{ cursor: 'move' }}
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      // Update selection: replace unless Shift pressed
                      const next = new Set(e.shiftKey ? selectedKfIds : [])
                      if (e.shiftKey && selectedKfIds.has(kf.id)) next.delete(kf.id)
                      else                                          next.add(kf.id)
                      onSelectKeyframes(next)
                      drag.begin(e, kf, t.target)
                    }}
                  />
                </g>
              )
            })
          })}
        </g>

        {/* ── Playhead vertical line ───────────────────────────────────── */}
        <line
          x1={LEFT_GUTTER + msToX(viewport, currentTimeMs)}
          x2={LEFT_GUTTER + msToX(viewport, currentTimeMs)}
          y1={TOP_GUTTER} y2={TOP_GUTTER + plotH}
          stroke="#ef4444" strokeWidth={1.5} opacity={0.85}
        />
      </svg>

      {/* Status bar — hover hint + drag readout */}
      <div className="px-2 py-1 text-[10px] font-mono text-gray-500 border-t border-gray-800 shrink-0">
        {drag.preview
          ? <>t = {Math.round(drag.preview.ms)}ms · v = {formatTickValue(drag.preview.value)}</>
          : <>Wheel = zoom · Shift+wheel = pan · Click empty space = seek · Drag node = retime/revalue · Shift = axis-lock</>
        }
      </div>
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function clampWindow(s: number, e: number, duration: number): { s: number; e: number } {
  const span = Math.max(50, e - s)
  let ns = Math.max(0, s)
  let ne = ns + span
  if (ne > duration * 1.5) { ne = duration * 1.5; ns = ne - span }
  return { s: ns, e: ne }
}

function niceTickArray(start: number, end: number, step: number): number[] {
  if (step <= 0) return []
  const out: number[] = []
  const first = Math.ceil(start / step) * step
  for (let v = first; v <= end + step * 0.001; v += step) out.push(v)
  return out
}

function formatTimeMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 2).replace(/\.?0+$/, '')}s`
  return `${Math.round(ms)}ms`
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="flex items-center justify-center h-full text-xs text-gray-500 bg-gray-950">
      {msg}
    </div>
  )
}
