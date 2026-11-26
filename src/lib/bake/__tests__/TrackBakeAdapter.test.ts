import { describe, expect, it } from 'vitest'
import type { Track } from '@/lib/types'
import { TrackBakeAdapter, createTrackBakeRecipe } from '../adapters/TrackBakeAdapter'

function track(): Track {
  return {
    target: 'layers.card.transform.x',
    keyframes: [],
    controller: { type: 'waveform', waveform: {
      shape: 'sine', amplitude: 20, frequency: 1, phase: 0, offset: 40, duty: .5,
    } },
  }
}

function recipe() {
  return createTrackBakeRecipe({
    source: { kind: 'track', ownerId: 'main:layers.card.transform.x', revision: 7 },
    timelineId: 'main', target: 'layers.card.transform.x', timelineDurationMs: 1000,
    startMs: 0, endMs: 1000, fps: 30, tolerance: .005,
  })
}

describe('TrackBakeAdapter', () => {
  it('reuses the numeric baker without mutating source or persisting its signal', () => {
    const source = track(), before = structuredClone(source), progress: number[] = []
    const preview = new TrackBakeAdapter(source).prepare(recipe(), {
      signal: new AbortController().signal,
      reportProgress: value => progress.push(value.value),
    })
    expect(source).toEqual(before)
    expect(preview.recipe).toEqual(recipe())
    expect(preview.track.controller).toBeUndefined()
    expect(preview.report.sampleCount).toBe(31)
    expect(progress).toEqual([.1, .95])
    expect(JSON.stringify(preview.recipe)).not.toContain('signal')
  })

  it('rejects mismatched, out-of-range and cancelled recipes atomically', () => {
    const source = track(), before = structuredClone(source), adapter = new TrackBakeAdapter(source)
    const context = { signal: new AbortController().signal, reportProgress: () => {} }
    expect(() => adapter.prepare({ ...recipe(), target: 'layers.other.x' }, context)).toThrow(/does not match/)
    expect(() => adapter.prepare({ ...recipe(), endMs: 1001 }, context)).toThrow(/inside/)
    const cancelled = new AbortController(); cancelled.abort()
    expect(() => adapter.prepare(recipe(), { ...context, signal: cancelled.signal })).toThrow(/cancel/i)
    expect(source).toEqual(before)
  })
})
