'use client'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { loadWaveformPeaks, peekCachedPeaks, type WaveformPeaks } from '@/lib/timeline/audioWaveform'
import { acquireAudioBufferFromUrl, type AudioPcmLease } from '@/lib/audio/AudioAssetService'
import { MAX_WAVEFORM_BUCKETS, waveformBucketCount, waveformExtrema, waveformPixelSourceRange } from '@/components/audio/waveformWindow'

interface Props {
  url: string; color?: string; background?: string; bucketCount?: number;
  sourceOffsetMs?: number; clipStartMs?: number; clipDurationMs?: number;
  visibleStartMs?: number; pixelsPerMs?: number; loop?: boolean;
}
/** Canvas only covers the visible clip, with source-time mapping kept separate
 * from placement and zoom. Resolution changes share the decoded asset cache. */
export default function AudioWaveform({ url, color = '#80d8ef', background, bucketCount,
  sourceOffsetMs = 0, clipStartMs = 0, clipDurationMs, visibleStartMs, pixelsPerMs, loop = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loaded, setLoaded] = useState<{ url: string; data: WaveformPeaks | null }>({ url, data: peekCachedPeaks(url, bucketCount ?? 512) })
  const data = loaded.url === url ? loaded.data : null
  const [detail, setDetail] = useState<{ url: string; buffer: AudioBuffer } | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [error, setError] = useState<{ url: string; message: string } | null>(null)
  const [retry, setRetry] = useState(0)
  const resolution = bucketCount ?? (data && pixelsPerMs ? waveformBucketCount(data.durationSec * 1000, pixelsPerMs) : 512)
  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const cached = peekCachedPeaks(url, resolution)
    if (cached) setLoaded({ url, data: cached })
    else setLoaded(previous => previous.url === url ? previous : { url, data: null })
    setError(null)
    if (cached) return
    loadWaveformPeaks(url, resolution, { signal: controller.signal }).then(peaks => {
      if (!cancelled) setLoaded({ url, data: peaks })
    }).catch(reason => {
      if (!cancelled) setError({ url, message: reason instanceof Error ? reason.message : String(reason) })
    })
    return () => { cancelled = true; controller.abort() }
  }, [url, resolution, retry])
  const needsDetail = !!(data && pixelsPerMs && data.durationSec * 1000 * pixelsPerMs > MAX_WAVEFORM_BUCKETS)
  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    let lease: AudioPcmLease | undefined
    setDetail(null)
    if (needsDetail) acquireAudioBufferFromUrl(url, { signal: controller.signal }).then(result => {
      if (cancelled) { result.release(); return }
      lease = result; setDetail({ url, buffer: result.buffer })
    }).catch(() => { /* overview peaks remain available */ })
    return () => { cancelled = true; controller.abort(); lease?.release() }
  }, [url, needsDetail])
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => setSize({ width: Math.ceil(el.clientWidth), height: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !(size.width > 0 && size.height > 0)) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.ceil(size.width * dpr)
    canvas.height = Math.ceil(size.height * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, size.width, size.height)
    if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, size.width, size.height) }
    if (!data) {
      ctx.fillStyle = '#71818b'
      ctx.fillRect(0, size.height / 2, size.width, 1)
      return
    }
    const channelData = (data as WaveformPeaks & { channelPeaks?: Float32Array[] }).channelPeaks
    const channels = Math.min(channelData?.length ?? 1, size.height >= 40 ? 2 : 1)
    const laneHeight = size.height / channels
    const ratio = pixelsPerMs && pixelsPerMs > 0 ? pixelsPerMs : size.width / (clipDurationMs ?? data.durationSec * 1000)
    // Deep zoom reads only the visible PCM interval. Keep overview rendering
    // bounded even for exceptionally long sources at coarse zoom levels.
    const detailBuffer = detail?.url === url && size.width / ratio / 1000 * detail.buffer.sampleRate < 2_000_000 ? detail.buffer : undefined
    ctx.strokeStyle = color; ctx.lineWidth = 1
    ctx.beginPath()
    for (let channel = 0; channel < channels; channel++) {
      const middle = channel * laneHeight + laneHeight / 2
      const half = Math.max(1, laneHeight / 2 - 2)
      for (let x = 0; x < size.width; x++) {
        const [sourceFrom, sourceTo] = waveformPixelSourceRange(sourceOffsetMs, clipStartMs, clipDurationMs ?? Infinity,
          visibleStartMs ?? clipStartMs, ratio, x)
        const [min, max] = waveformExtrema(data, sourceFrom, sourceTo, loop, channel, detailBuffer)
        ctx.moveTo(x + 0.5, middle - max * half)
        ctx.lineTo(x + 0.5, middle - min * half)
      }
    }
    ctx.stroke()
    if (channels > 1) {
      ctx.strokeStyle = '#ffffff25'; ctx.beginPath(); ctx.moveTo(0, laneHeight); ctx.lineTo(size.width, laneHeight); ctx.stroke()
    }
  }, [data, detail, size, color, background, sourceOffsetMs, clipStartMs, clipDurationMs, visibleStartMs, pixelsPerMs, loop])
  return <div ref={containerRef} className="absolute inset-0 pointer-events-none" aria-label="Audio waveform">
    <canvas ref={canvasRef} className="block w-full h-full" />
    {error?.url === url && <button type="button" title={error.message}
      className="absolute inset-0 text-[10px] text-red-200 bg-red-950/70 pointer-events-auto"
      onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); setRetry(value => value + 1) }}>
      Waveform unavailable · Retry
    </button>}
  </div>
}
