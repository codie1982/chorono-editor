'use client'
import { useMemo } from 'react'
import type { ChronoScene, Layer, Track } from '@/lib/types'
import { evaluateTrack } from '@/lib/evaluator'

interface Props {
  layer:         Layer
  scene:         ChronoScene
  zoom:          number
  currentTimeMs: number
}

/**
 * SVGator-style motion path visualisation.
 *
 * Finds the position keyframes (transform.x / transform.y) for the selected
 * layer across all timelines, samples the interpolated trajectory, and draws
 * it as an SVG overlay positioned inside the zoomed artboard container.
 *
 *   ── trajectory line (solid, blue)
 *   • dotted samples along the path (interpolation feedback)
 *   ◆ diamond nodes at each keyframe time
 *   ● filled dot for the current playhead position
 *
 * The overlay is `pointer-events: none` — interactive bezier handles are a
 * Phase 2 feature that requires moving from independent x/y tracks to a
 * single vec2 position track. This component is read-only for now.
 *
 * Renders nothing when fewer than 2 position keyframes exist (no path to draw).
 */
export default function MotionPathOverlay({
  layer, scene, zoom, currentTimeMs,
}: Props) {
  const data = useMemo(() => buildPathData(layer, scene), [layer, scene])
  if (!data) return null

  const { samples, keyframeTimes, xTrack, yTrack, anchorX, anchorY } = data

  // Resolve the current time position on the path so we can highlight it.
  const head = evalXY(xTrack, yTrack, currentTimeMs, layer.transform.x, layer.transform.y)

  // SVG path string built from sample points (M then series of L)
  const d = samples.length
    ? `M ${samples[0].x * zoom} ${samples[0].y * zoom} ` +
      samples.slice(1).map((p) => `L ${p.x * zoom} ${p.y * zoom}`).join(' ')
    : ''

  // SVG covers the same area as the artboard — its parent container is
  // already at canvas-scale (width = composition.width * zoom).
  return (
    <svg
      className="absolute inset-0 pointer-events-none z-30 overflow-visible"
      style={{ width: '100%', height: '100%' }}
    >
      {/* Trajectory line */}
      <path
        d={d}
        fill="none"
        stroke="#60a5fa"            /* blue-400 */
        strokeWidth={1.5}
        strokeDasharray="0"
        opacity={0.9}
      />
      {/* Interpolation sample dots — sparse so they look like a guide,
          not a noisy texture. Every 4th sample. */}
      {samples.map((p, i) => (i % 4 === 0 ? (
        <circle
          key={`s-${i}`}
          cx={p.x * zoom}
          cy={p.y * zoom}
          r={1.5}
          fill="#60a5fa"
          opacity={0.55}
        />
      ) : null))}

      {/* Keyframe nodes — diamonds at each kf time. The anchor offset is
          added so the diamond sits where the layer's anchor will be when
          the playhead reaches that frame, matching the selection-frame
          pivot the user sees. */}
      {keyframeTimes.map((t, i) => {
        const pos = evalXY(xTrack, yTrack, t, layer.transform.x, layer.transform.y)
        const cx = (pos.x + anchorX) * zoom
        const cy = (pos.y + anchorY) * zoom
        return (
          <g key={`k-${i}`} transform={`translate(${cx} ${cy}) rotate(45)`}>
            <rect
              x={-4} y={-4} width={8} height={8}
              fill="#1e293b"
              stroke="#60a5fa"
              strokeWidth={1.5}
            />
          </g>
        )
      })}

      {/* Current time indicator — small filled dot on the trajectory */}
      <circle
        cx={(head.x + anchorX) * zoom}
        cy={(head.y + anchorY) * zoom}
        r={3.5}
        fill="#3b82f6"
        stroke="#ffffff"
        strokeWidth={1.5}
      />
    </svg>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

interface SamplePoint { x: number; y: number }

interface PathData {
  samples:       SamplePoint[]
  keyframeTimes: number[]
  xTrack:        Track | null
  yTrack:        Track | null
  anchorX:       number
  anchorY:       number
}

/** Walk every timeline track looking for this layer's x/y position tracks.
 *  Returns null when there's no path worth drawing (< 2 keyframes total). */
function buildPathData(layer: Layer, scene: ChronoScene): PathData | null {
  let xTrack: Track | null = null
  let yTrack: Track | null = null
  const xTarget = `layers.${layer.id}.transform.x`
  const yTarget = `layers.${layer.id}.transform.y`

  for (const tl of scene.timelines ?? []) {
    for (const tr of tl.tracks) {
      if (tr.target === xTarget) xTrack = tr
      if (tr.target === yTarget) yTrack = tr
    }
  }

  // Union of keyframe times — anywhere x OR y changes is a node on the path.
  const tSet = new Set<number>()
  xTrack?.keyframes.forEach((k) => tSet.add(k.timeMs))
  yTrack?.keyframes.forEach((k) => tSet.add(k.timeMs))
  const keyframeTimes = Array.from(tSet).sort((a, b) => a - b)

  // Need at least 2 distinct anchor points to draw a trajectory.
  if (keyframeTimes.length < 2) return null

  // Sample uniformly between first and last keyframe — ~40 samples gives a
  // smooth curve without being expensive. Endpoints are always included.
  const t0 = keyframeTimes[0]
  const t1 = keyframeTimes[keyframeTimes.length - 1]
  const N = 48
  const samples: SamplePoint[] = []
  for (let i = 0; i <= N; i++) {
    const t = t0 + ((t1 - t0) * i) / N
    const p = evalXY(xTrack, yTrack, t, layer.transform.x, layer.transform.y)
    // Apply anchor offset so the curve traces where the anchor (the actual
    // pivot the user sees) travels, not the top-left corner.
    samples.push({ x: p.x + layer.transform.anchorX, y: p.y + layer.transform.anchorY })
  }

  return {
    samples,
    keyframeTimes,
    xTrack,
    yTrack,
    anchorX: layer.transform.anchorX,
    anchorY: layer.transform.anchorY,
  }
}

/** Evaluate (x, y) at a given time, falling back to the layer's static
 *  transform value if the track is missing or has no keyframes. */
function evalXY(
  xTrack: Track | null,
  yTrack: Track | null,
  timeMs: number,
  fallbackX: number,
  fallbackY: number,
): { x: number; y: number } {
  const x = xTrack ? evaluateTrack(xTrack, timeMs) : null
  const y = yTrack ? evaluateTrack(yTrack, timeMs) : null
  return {
    x: x !== null ? x : fallbackX,
    y: y !== null ? y : fallbackY,
  }
}
