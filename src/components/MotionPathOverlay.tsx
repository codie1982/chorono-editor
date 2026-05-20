'use client'
import { useMemo, useRef, useCallback } from 'react'
import type { ChronoScene, Layer, Track } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { evaluateTrack } from '@/lib/evaluator'
import { updateKfValue } from '@/lib/timeline/keyframeOps'
import { makeUpdateKfValueCmd } from '@/lib/editor/commands-keyframe'
import { makeBatchCmd } from '@/lib/editor/commands-batch'

interface Props {
  layer:         Layer
  scene:         ChronoScene
  zoom:          number
  currentTimeMs: number
  /** Editor handle — lets keyframe nodes be dragged to edit their values. */
  editor:        EditorStateReturn
  /** Composition width (px) — used to convert client px deltas to comp px. */
  compositionWidth: number
}

/**
 * SVGator-style motion path visualisation + editable keyframe nodes.
 *
 * Finds the position keyframes (transform.x / transform.y) for the selected
 * layer, samples the interpolated trajectory, draws it, and renders a draggable
 * diamond at each keyframe time. Dragging a diamond edits that keyframe's
 * transform.x / transform.y values directly on the canvas.
 *
 * Renders nothing when fewer than 2 position keyframes exist.
 */
export default function MotionPathOverlay({
  layer, scene, zoom, currentTimeMs, editor, compositionWidth,
}: Props) {
  const data = useMemo(() => buildPathData(layer, scene), [layer, scene])
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef<{
    scale: number
    startClientX: number; startClientY: number
    xKfId?: string; yKfId?: string
    startX: number; startY: number
  } | null>(null)

  const handleMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current
    if (!d || !data) return
    const dx = (e.clientX - d.startClientX) * d.scale
    const dy = (e.clientY - d.startClientY) * d.scale
    let next = editor.scene
    if (d.xKfId && data.xTrack && data.xTimelineId)
      next = updateKfValue(next, data.xTimelineId, data.xTrack.target, d.xKfId, d.startX + dx)
    if (d.yKfId && data.yTrack && data.yTimelineId)
      next = updateKfValue(next, data.yTimelineId, data.yTrack.target, d.yKfId, d.startY + dy)
    editor.previewTransaction(next)
  }, [data, editor])

  const handleUp = useCallback((e: PointerEvent) => {
    const d = dragRef.current
    dragRef.current = null
    window.removeEventListener('pointermove', handleMove)
    window.removeEventListener('pointerup', handleUp)
    if (!d || !data) return
    const dx = (e.clientX - d.startClientX) * d.scale
    const dy = (e.clientY - d.startClientY) * d.scale
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) { editor.cancelTransaction(); return }
    const cmds = []
    if (d.xKfId && data.xTrack && data.xTimelineId)
      cmds.push(makeUpdateKfValueCmd(data.xTimelineId, data.xTrack.target, d.xKfId, d.startX, d.startX + dx))
    if (d.yKfId && data.yTrack && data.yTimelineId)
      cmds.push(makeUpdateKfValueCmd(data.yTimelineId, data.yTrack.target, d.yKfId, d.startY, d.startY + dy))
    if (cmds.length === 0) { editor.cancelTransaction(); return }
    editor.commitTransaction(cmds.length === 1 ? cmds[0] : makeBatchCmd('Move Keyframe', cmds))
  }, [data, editor, handleMove])

  const beginKfDrag = useCallback((t: number) => (e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const svg = svgRef.current
    if (!svg || !data) return
    const rect = svg.getBoundingClientRect()
    const scale = rect.width > 0 ? compositionWidth / rect.width : 1
    const xKf = data.xTrack?.keyframes.find((k) => Math.abs(k.timeMs - t) < 0.5)
    const yKf = data.yTrack?.keyframes.find((k) => Math.abs(k.timeMs - t) < 0.5)
    if (!xKf && !yKf) return
    dragRef.current = {
      scale,
      startClientX: e.clientX, startClientY: e.clientY,
      xKfId: xKf?.id, yKfId: yKf?.id,
      startX: xKf ? (xKf.value as number) : 0,
      startY: yKf ? (yKf.value as number) : 0,
    }
    editor.beginTransaction()
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }, [data, editor, compositionWidth, handleMove, handleUp])

  if (!data) return null

  const { samples, keyframeTimes, xTrack, yTrack, anchorX, anchorY } = data

  // Resolve the current time position on the path so we can highlight it.
  const head = evalXY(xTrack, yTrack, currentTimeMs, layer.transform.x, layer.transform.y)

  // SVG path string built from sample points (M then series of L)
  const d = samples.length
    ? `M ${samples[0].x * zoom} ${samples[0].y * zoom} ` +
      samples.slice(1).map((p) => `L ${p.x * zoom} ${p.y * zoom}`).join(' ')
    : ''

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 z-30 overflow-visible"
      style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      {/* Trajectory line */}
      <path d={d} fill="none" stroke="#60a5fa" strokeWidth={1.5} strokeDasharray="0" opacity={0.9} />

      {/* Interpolation sample dots — every 4th sample */}
      {samples.map((p, i) => (i % 4 === 0 ? (
        <circle key={`s-${i}`} cx={p.x * zoom} cy={p.y * zoom} r={1.5} fill="#60a5fa" opacity={0.55} />
      ) : null))}

      {/* Keyframe nodes — draggable diamonds at each kf time. pointerEvents
          re-enabled here only (the svg itself stays transparent to clicks). */}
      {keyframeTimes.map((t, i) => {
        const pos = evalXY(xTrack, yTrack, t, layer.transform.x, layer.transform.y)
        const cx = (pos.x + anchorX) * zoom
        const cy = (pos.y + anchorY) * zoom
        return (
          <g
            key={`k-${i}`}
            transform={`translate(${cx} ${cy}) rotate(45)`}
            style={{ pointerEvents: 'all', cursor: 'grab' }}
            onPointerDown={beginKfDrag(t)}
          >
            {/* invisible larger hit target for easier grabbing */}
            <rect x={-7} y={-7} width={14} height={14} fill="transparent" />
            <rect x={-4} y={-4} width={8} height={8} fill="#1e293b" stroke="#60a5fa" strokeWidth={1.5} />
          </g>
        )
      })}

      {/* Current time indicator */}
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
  xTimelineId:   string | null
  yTimelineId:   string | null
  anchorX:       number
  anchorY:       number
}

/** Walk every timeline track looking for this layer's x/y position tracks.
 *  Returns null when there's no path worth drawing (< 2 keyframes total). */
function buildPathData(layer: Layer, scene: ChronoScene): PathData | null {
  let xTrack: Track | null = null
  let yTrack: Track | null = null
  let xTimelineId: string | null = null
  let yTimelineId: string | null = null
  const xTarget = `layers.${layer.id}.transform.x`
  const yTarget = `layers.${layer.id}.transform.y`

  for (const tl of scene.timelines ?? []) {
    for (const tr of tl.tracks) {
      if (tr.target === xTarget) { xTrack = tr; xTimelineId = tl.id }
      if (tr.target === yTarget) { yTrack = tr; yTimelineId = tl.id }
    }
  }

  // Union of keyframe times — anywhere x OR y changes is a node on the path.
  const tSet = new Set<number>()
  xTrack?.keyframes.forEach((k) => tSet.add(k.timeMs))
  yTrack?.keyframes.forEach((k) => tSet.add(k.timeMs))
  const keyframeTimes = Array.from(tSet).sort((a, b) => a - b)

  // Need at least 2 distinct anchor points to draw a trajectory.
  if (keyframeTimes.length < 2) return null

  const t0 = keyframeTimes[0]
  const t1 = keyframeTimes[keyframeTimes.length - 1]
  const N = 48
  const samples: SamplePoint[] = []
  for (let i = 0; i <= N; i++) {
    const t = t0 + ((t1 - t0) * i) / N
    const p = evalXY(xTrack, yTrack, t, layer.transform.x, layer.transform.y)
    samples.push({ x: p.x + layer.transform.anchorX, y: p.y + layer.transform.anchorY })
  }

  return {
    samples,
    keyframeTimes,
    xTrack,
    yTrack,
    xTimelineId,
    yTimelineId,
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
