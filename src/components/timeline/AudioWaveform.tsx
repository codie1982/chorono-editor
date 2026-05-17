'use client'
// ── AudioWaveform (BL-37) ──────────────────────────────────────────────────
// Renders an asset's downsampled audio peaks onto a canvas. Sized to fill
// the parent — typically the audio layer's activity bar in the timeline.
//
// Peaks are lazy-fetched via loadWaveformPeaks, then drawn as min/max
// vertical lines per pixel. Re-renders on resize via ResizeObserver and
// on data arrival.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { loadWaveformPeaks, peekCachedPeaks, type WaveformPeaks } from '@/lib/timeline/audioWaveform'

interface Props {
  /** Source asset URL (blob: or http:). */
  url:    string
  /** Stroke colour (hex). */
  color?: string
  /** Background fill colour (optional). */
  background?: string
  /** Number of buckets — controls peak resolution. Default 400. */
  bucketCount?: number
}

export default function AudioWaveform({
  url, color = '#ffffff', background, bucketCount = 400,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [peaks, setPeaks] = useState<WaveformPeaks | null>(() => peekCachedPeaks(url, bucketCount))
  const [size, setSize] = useState({ w: 0, h: 0 })

  // Kick off fetch / decode if not cached.
  useEffect(() => {
    let cancelled = false
    if (!peeks_match(peaks, url, bucketCount)) {
      loadWaveformPeaks(url, bucketCount)
        .then((p) => { if (!cancelled) setPeaks(p) })
        .catch(() => { /* logged inside loader */ })
    }
    return () => { cancelled = true }
  }, [url, bucketCount, peaks])

  // ResizeObserver — re-paint when the container changes size.
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Paint.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size.w === 0 || size.h === 0) return
    const dpr = window.devicePixelRatio || 1
    canvas.width  = Math.floor(size.w * dpr)
    canvas.height = Math.floor(size.h * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, size.w, size.h)
    if (background) {
      ctx.fillStyle = background
      ctx.fillRect(0, 0, size.w, size.h)
    }
    if (!peaks || peaks.peaks.length === 0) {
      // Placeholder bar so the row isn't empty while decoding.
      ctx.fillStyle = color + '40'
      ctx.fillRect(0, size.h / 2 - 1, size.w, 2)
      return
    }
    const mid = size.h / 2
    const half = size.h / 2 - 1
    // Map peak bucket index → screen X.
    const buckets = peaks.bucketCount
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = 0; x < size.w; x++) {
      const b = Math.floor((x / size.w) * buckets)
      const min = peaks.peaks[b * 2]
      const max = peaks.peaks[b * 2 + 1]
      const y1 = mid - max * half
      const y2 = mid - min * half
      ctx.moveTo(x + 0.5, y1)
      ctx.lineTo(x + 0.5, y2)
    }
    ctx.stroke()
  }, [peaks, size, color, background])

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none">
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  )
}

function peeks_match(p: WaveformPeaks | null, _url: string, bc: number): boolean {
  // Lightweight check — if the cached buckets match expected size, skip fetch.
  return !!p && p.bucketCount === bc
}
