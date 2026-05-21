import { useEffect, useState } from 'react'

// ── Rulers (px scales on top + left edges of the canvas leaf) ────────────────

interface RulersProps {
  composition: { width: number; height: number }
  zoom: number
  pan: { x: number; y: number }
  containerEl: HTMLDivElement
  /** Selected layer's axis-aligned bounding rect in composition px. When
   *  provided the rulers highlight the rect's extents with a coloured
   *  band + dashed guide line tying the band to the artboard (Figma /
   *  Photoshop pattern). */
  selectedRect?: { x: number; y: number; width: number; height: number }
}

const RULER_THICK = 18  // px — strip height/width

/**
 * Picks a "nice" tick interval (composition px) so that major ticks fall
 * roughly every 80 screen px regardless of zoom.
 */
function pickRulerStep(zoom: number): number {
  const TARGET_PX = 80
  const compPx = TARGET_PX / Math.max(0.001, zoom)
  const niceSteps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]
  for (const s of niceSteps) if (s >= compPx) return s
  return niceSteps[niceSteps.length - 1]
}

export function Rulers({ composition, zoom, pan, containerEl, selectedRect }: RulersProps) {
  // Re-render when the container resizes so ruler ticks stay aligned with
  // the leaf's current bounds.
  const [, setTick] = useState(0)
  useEffect(() => {
    const ro = new ResizeObserver(() => setTick((t) => t + 1))
    ro.observe(containerEl)
    return () => ro.disconnect()
  }, [containerEl])

  const rect = containerEl.getBoundingClientRect()
  const cw = rect.width, ch = rect.height
  // Canvas top-left in container-relative coords:
  // flex centres the (canvas + 2×PADDING) wrapper, plus the pan translate.
  const originX = cw / 2 - (composition.width  * zoom) / 2 + pan.x
  const originY = ch / 2 - (composition.height * zoom) / 2 + pan.y

  const step = pickRulerStep(zoom)
  // X ticks (composition x = 0, step, 2·step, …, width)
  const xTicks: number[] = []
  for (let x = 0; x <= composition.width;  x += step) xTicks.push(x)
  const yTicks: number[] = []
  for (let y = 0; y <= composition.height; y += step) yTicks.push(y)

  // Common style for tick labels
  const label = 'absolute text-[9px] font-mono text-gray-500 pointer-events-none select-none'
  const tickStroke = 'rgba(160,160,160,0.55)'

  // Selected-layer extents in screen-px (clamped to the ruler track)
  const sel = selectedRect
  const selSX1 = sel ? originX + sel.x * zoom                : 0
  const selSX2 = sel ? originX + (sel.x + sel.width) * zoom  : 0
  const selSY1 = sel ? originY + sel.y * zoom                : 0
  const selSY2 = sel ? originY + (sel.y + sel.height) * zoom : 0

  return (
    <>
      {/* TOP RULER — horizontal strip pinned to the leaf's top edge */}
      <div
        className="absolute top-0 left-0 right-0 bg-gray-900/95 border-b border-gray-700 pointer-events-none z-20"
        style={{ height: RULER_THICK }}
      >
        {/* Corner spacer (overlaps the left ruler's gutter) */}
        <div className="absolute top-0 left-0 bg-gray-900/95 border-r border-gray-700"
             style={{ width: RULER_THICK, height: RULER_THICK }} />

        {/* Selected-layer X extent — blue band on the ruler track */}
        {sel && (() => {
          const left  = Math.max(RULER_THICK, selSX1)
          const right = Math.min(cw, selSX2)
          if (right <= left) return null
          return (
            <>
              <div
                className="absolute bottom-0 bg-blue-500/40 border-t border-blue-400"
                style={{ left, width: right - left, height: 6 }}
              />
              {/* Position labels at the band edges (only when inside view) */}
              {selSX1 >= RULER_THICK && (
                <span className="absolute top-0.5 text-[9px] font-mono text-blue-300 px-0.5 bg-gray-900/90 rounded pointer-events-none"
                      style={{ left: selSX1 + 2 }}>
                  {Math.round(sel.x)}
                </span>
              )}
              {selSX2 <= cw && (
                <span className="absolute top-0.5 text-[9px] font-mono text-blue-300 px-0.5 bg-gray-900/90 rounded pointer-events-none"
                      style={{ left: selSX2 - 26 }}>
                  {Math.round(sel.x + sel.width)}
                </span>
              )}
            </>
          )
        })()}

        {xTicks.map((cx) => {
          const sx = originX + cx * zoom
          if (sx < RULER_THICK || sx > cw) return null
          return (
            <div key={cx} className="absolute top-0 h-full" style={{ left: sx }}>
              <div style={{ position: 'absolute', bottom: 0, width: 1, height: 6, background: tickStroke }} />
              <span className={label} style={{ top: 2, left: 3 }}>{cx}</span>
            </div>
          )
        })}
      </div>

      {/* LEFT RULER — vertical strip pinned to the leaf's left edge */}
      <div
        className="absolute top-0 left-0 bottom-0 bg-gray-900/95 border-r border-gray-700 pointer-events-none z-20"
        style={{ width: RULER_THICK }}
      >
        {/* Selected-layer Y extent — blue band on the ruler track */}
        {sel && (() => {
          const top    = Math.max(RULER_THICK, selSY1)
          const bottom = Math.min(ch, selSY2)
          if (bottom <= top) return null
          return (
            <>
              <div
                className="absolute right-0 bg-blue-500/40 border-l border-blue-400"
                style={{ top, height: bottom - top, width: 6 }}
              />
              {selSY1 >= RULER_THICK && (
                <span className="absolute left-0.5 text-[9px] font-mono text-blue-300 px-0.5 bg-gray-900/90 rounded pointer-events-none"
                      style={{ top: selSY1 + 1 }}>
                  {Math.round(sel.y)}
                </span>
              )}
              {selSY2 <= ch && (
                <span className="absolute left-0.5 text-[9px] font-mono text-blue-300 px-0.5 bg-gray-900/90 rounded pointer-events-none"
                      style={{ top: selSY2 - 12 }}>
                  {Math.round(sel.y + sel.height)}
                </span>
              )}
            </>
          )
        })()}

        {yTicks.map((cy) => {
          const sy = originY + cy * zoom
          if (sy < RULER_THICK || sy > ch) return null
          return (
            <div key={cy} className="absolute left-0 w-full" style={{ top: sy }}>
              <div style={{ position: 'absolute', right: 0, height: 1, width: 6, background: tickStroke }} />
              <span className={label}
                style={{
                  top: 0, left: 2,
                  transform: 'rotate(-90deg) translate(-100%, 100%)',
                  transformOrigin: '0 0',
                  whiteSpace: 'nowrap',
                }}>{cy}</span>
            </div>
          )
        })}
      </div>

      {/* Dashed guide lines tying the selected layer's edges to the rulers.
          Span from the ruler edge across the leaf so the user can eyeball
          alignment with anything in the work area, not just the artboard. */}
      {sel && (
        <div className="absolute inset-0 pointer-events-none z-10">
          {[selSX1, selSX2].map((x, i) =>
            x >= RULER_THICK && x <= cw ? (
              <div
                key={`v${i}`}
                className="absolute top-0 bottom-0 border-l border-dashed border-blue-400/40"
                style={{ left: x }}
              />
            ) : null
          )}
          {[selSY1, selSY2].map((y, i) =>
            y >= RULER_THICK && y <= ch ? (
              <div
                key={`h${i}`}
                className="absolute left-0 right-0 border-t border-dashed border-blue-400/40"
                style={{ top: y }}
              />
            ) : null
          )}
        </div>
      )}
    </>
  )
}
