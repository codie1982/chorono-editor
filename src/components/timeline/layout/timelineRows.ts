import type { Keyframe, Layer, Track } from '@/lib/types'
import type { RowLayout } from '@/lib/editor/virtualization/RowLayout'
import { sampleTrackValueRange, valueToY } from '@/lib/timeline/valueGraph'
import { gainEnvelopeY } from '@/components/audio/gainEnvelopeY'

export const TIMELINE_HEADER = 32
export const TIMELINE_AUDIO_HEADER = 64
export const TIMELINE_TRACK = 28
export const TIMELINE_GRAPH_TRACK = 72
export const TIMELINE_ADD = 28
export interface TimelineSectionRow { layer: Layer; tracks: readonly Track[]; expanded: boolean }

/** Exact CSS-pixel section extent shared by virtualization and key hit testing.
 * Borders use border-box sizing; audio controls fit inside the 64px header. */
export function timelineSectionHeight(row: TimelineSectionRow, graph: boolean): number {
  return headerHeight(row.layer) + (row.expanded ? row.tracks.length * trackHeight(graph) + TIMELINE_ADD : 0)
}
/** Native section-header extent in CSS pixels: 64 for audio, otherwise 32. */
export function headerHeight(layer: Layer): number { return layer.type === 'audio' ? TIMELINE_AUDIO_HEADER : TIMELINE_HEADER }
/** Native property-row extent in CSS pixels: 72 for Curve, 28 for Dope. */
export function trackHeight(graph: boolean): number { return graph ? TIMELINE_GRAPH_TRACK : TIMELINE_TRACK }

interface HitRequest {
  rows: readonly TimelineSectionRow[]; layout: RowLayout; graph: boolean
  box: { x: number; y: number; w: number; h: number }
  labelWidth: number; trackWidth: number; offset: number
  previewMs: Readonly<Record<string, number>>; msToX: (timeMs: number) => number
  /** CSS top of a potentially sticky header, in scroll-content coordinates. */
  headerTop: (index: number) => number
  /** Native clipped gain keys for this row, independent of property filtering. */
  audioKeys: (layer: Layer) => readonly Keyframe[]
}

/**
 * Data-based marquee selection, independent of mounted DOM. Uses the same
 * track heights, value range, preview times and gain ordinate as drawing.
 * Hidden/collapsed property rows stay excluded. Temporal x clipping retains
 * the native ±10px key guard; audioKeys supplies its stricter clip interval.
 * No state is mutated; duplicate audio/property views contribute an id once.
 */
export function timelineKeysInBox(request: HitRequest): Set<string> {
  const { box, rows, layout, graph, previewMs } = request, hits = new Set<string>()
  const test = (key: Keyframe, y: number, audio = false) => {
    const x = request.msToX(previewMs[key.id] ?? key.timeMs)
    if (x < -10 || x > request.trackWidth + 10) return
    const contentX = request.labelWidth + x + (audio ? 1 : 0)
    if (contentX >= box.x && contentX <= box.x + box.w && y >= box.y && y <= box.y + box.h) hits.add(key.id)
  }
  rows.forEach((row, index) => {
    const top = layout.top(index) + request.offset
    if (row.layer.type === 'audio') for (const key of request.audioKeys(row.layer)) {
      if (typeof key.value === 'number') test(key, request.headerTop(index) + 5 + gainEnvelopeY(key.value), true)
    }
    if (!row.expanded || top > box.y + box.h || top + timelineSectionHeight(row, graph) < box.y) return
    row.tracks.forEach((track, trackIndex) => {
      const range = graph ? sampleTrackValueRange(track) : null, height = trackHeight(graph)
      for (const key of track.keyframes) test(key, top + headerHeight(row.layer) + trackIndex * height
        + (range && typeof key.value === 'number' ? valueToY(key.value, range, height) : height / 2))
    })
  })
  return hits
}
