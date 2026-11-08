import { describe, expect, it } from 'vitest'
import type { Track } from '@/lib/types'
import { LayerTrackIndex } from './LayerTrackIndex'

describe('LayerTrackIndex', () => {
  it('preserves canonical prefix membership, duplicate order and borrowed keys', () => {
    const targets = ['layers.a.opacity', 'layers.ab.opacity', 'layers.a.transform.x', 'layers.a.opacity',
      'effects.a.amount', 'layers.a', 'layers.a.', 'layers.a.b.opacity', 'layers..opacity']
    const tracks: Track[] = targets.map(target => ({ target, keyframes: [] }))
    const index = new LayerTrackIndex(tracks)
    for (const id of ['a', 'ab', 'a.b', 'missing', '']) {
      expect(index.forLayer(id)).toEqual(tracks.filter(track => track.target.startsWith(`layers.${id}.`)))
    }
    expect(index.forLayer('a')[0]).toBe(tracks[0])
    expect(index.forLayer('a')).toBe(index.forLayer('a'))
    expect(tracks.map(track => track.target)).toEqual(targets)
  })

  it('rebuilds correctly after reparented targets and timeline switching', () => {
    const a: Track = { target: 'layers.a.opacity', keyframes: [] }
    const before = new LayerTrackIndex([a]), after = new LayerTrackIndex([{ ...a, target: 'layers.b.opacity' }])
    expect(before.forLayer('a')).toHaveLength(1)
    expect(after.forLayer('a')).toHaveLength(0)
    expect(after.forLayer('b')).toHaveLength(1)
    expect(new LayerTrackIndex([]).forLayer('a')).toHaveLength(0)
  })
})
