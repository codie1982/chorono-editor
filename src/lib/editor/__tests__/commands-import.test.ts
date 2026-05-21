import { describe, it, expect } from 'vitest'
import {
  makeImportAssetsCmd,
  makeImportDocumentCmd,
  makeDeleteAssetCmd,
  makeAddAssetToCollectionCmd,
} from '../commands-import'
import { emptyScene as makeEmptyScene } from '../../defaults'
import type { ChronoScene, Layer, Timeline, Track } from '../../types/core'
import type { Asset } from '../../asset/types'

// ── Fixtures ─────────────────────────────────────────────────────────────────────

function asset(id: string, over: Partial<Asset> = {}): Asset {
  return { id, name: over.name ?? id, type: over.type ?? 'image', url: `blob:${id}`, ...over }
}

function layer(id: string, assetId = `${id}_a`): Layer {
  return {
    id,
    name: id,
    type: 'image',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 },
    opacity: 1,
    image: { assetId },
  } as Layer
}

function track(target: string): Track {
  return { target, keyframes: [] }
}

function timeline(id: string, tracks: Track[] = []): Timeline {
  return { id, durationMs: 5000, autoplay: false, loop: false, tracks }
}

function scene(over: Partial<ChronoScene> = {}): ChronoScene {
  return { ...makeEmptyScene(), ...over }
}

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('makeImportAssetsCmd', () => {
  it('adds assets + layers and undoes them', () => {
    const cmd = makeImportAssetsCmd([asset('a1')], [layer('l1')])
    const s0 = scene()
    const s1 = cmd.execute(s0)
    expect(s1.assets.map(a => a.id)).toEqual(['a1'])
    expect(s1.layers.map(l => l.id)).toEqual(['l1'])
    const s2 = cmd.undo(s1)
    expect(s2.assets).toEqual([])
    expect(s2.layers).toEqual([])
  })

  it('does not duplicate assets/layers already present', () => {
    const cmd = makeImportAssetsCmd([asset('a1')], [layer('l1')])
    const s1 = cmd.execute(scene({ assets: [asset('a1')], layers: [layer('l1')] }))
    expect(s1.assets).toHaveLength(1)
    expect(s1.layers).toHaveLength(1)
  })

  it('auto-labels single asset import', () => {
    const cmd = makeImportAssetsCmd([asset('a1', { name: 'photo.jpg' })], [layer('l1')])
    expect(cmd.label).toBe('Import photo.jpg')
  })

  it('auto-labels multi-asset import with a count', () => {
    const cmd = makeImportAssetsCmd([asset('a1'), asset('a2')], [layer('l1'), layer('l2')])
    expect(cmd.label).toBe('Import 2 assets')
  })

  it('honours an explicit label', () => {
    const cmd = makeImportAssetsCmd([asset('a1')], [layer('l1')], 'Custom')
    expect(cmd.label).toBe('Custom')
  })
})

describe('makeImportDocumentCmd', () => {
  it('adds assets, layers and merges tracks into target timeline', () => {
    const cmd = makeImportDocumentCmd({
      assets: [asset('a1')],
      layers: [layer('l1')],
      tracks: [track('layers.l1.opacity')],
      timelineId: 't1',
      label: 'Import doc',
    })
    const s1 = cmd.execute(scene({ timelines: [timeline('t1')] }))
    expect(s1.assets.map(a => a.id)).toEqual(['a1'])
    expect(s1.timelines[0].tracks.map(t => t.target)).toEqual(['layers.l1.opacity'])
  })

  it('merges tracks into the first timeline when no timelineId given', () => {
    const cmd = makeImportDocumentCmd({
      assets: [], layers: [],
      tracks: [track('t.x')],
      label: 'doc',
    })
    const s1 = cmd.execute(scene({ timelines: [timeline('first'), timeline('second')] }))
    expect(s1.timelines[0].tracks).toHaveLength(1)
    expect(s1.timelines[1].tracks).toHaveLength(0)
  })

  it('undo removes assets, layers and tracks', () => {
    const cmd = makeImportDocumentCmd({
      assets: [asset('a1')],
      layers: [layer('l1')],
      tracks: [track('t.x')],
      timelineId: 't1',
      label: 'doc',
    })
    const s0 = scene({ timelines: [timeline('t1')] })
    const s1 = cmd.execute(s0)
    const s2 = cmd.undo(s1)
    expect(s2.assets).toEqual([])
    expect(s2.layers).toEqual([])
    expect(s2.timelines[0].tracks).toEqual([])
  })

  it('leaves timelines untouched on undo when there were no tracks', () => {
    const cmd = makeImportDocumentCmd({
      assets: [asset('a1')], layers: [layer('l1')], label: 'doc',
    })
    const s0 = scene({ timelines: [timeline('t1', [track('preexisting')])] })
    const s2 = cmd.undo(cmd.execute(s0))
    expect(s2.timelines[0].tracks.map(t => t.target)).toEqual(['preexisting'])
  })
})

describe('makeDeleteAssetCmd', () => {
  it('removes the asset and referencing layers', () => {
    const prev = scene({ assets: [asset('a1')], layers: [layer('l1', 'a1'), layer('l2', 'a1')] })
    const cmd = makeDeleteAssetCmd('a1', ['l1', 'l2'], prev)
    const s1 = cmd.execute(prev)
    expect(s1.assets).toEqual([])
    expect(s1.layers).toEqual([])
  })

  it('restores asset and layers on undo', () => {
    const prev = scene({ assets: [asset('a1', { name: 'pic' })], layers: [layer('l1', 'a1')] })
    const cmd = makeDeleteAssetCmd('a1', ['l1'], prev)
    const s2 = cmd.undo(cmd.execute(prev))
    expect(s2.assets.map(a => a.id)).toEqual(['a1'])
    expect(s2.layers.map(l => l.id)).toEqual(['l1'])
  })

  it('labels with the asset name', () => {
    const prev = scene({ assets: [asset('a1', { name: 'logo.png' })], layers: [] })
    const cmd = makeDeleteAssetCmd('a1', [], prev)
    expect(cmd.label).toContain('logo.png')
  })

  it('undo is a no-op when the asset was unknown', () => {
    const prev = scene()
    const cmd = makeDeleteAssetCmd('ghost', [], prev)
    const s = cmd.undo(scene())
    expect(s.assets).toEqual([])
  })
})

describe('makeAddAssetToCollectionCmd', () => {
  it('adds the asset id to the target collection', () => {
    const cmd = makeAddAssetToCollectionCmd('a1', 'c1')
    const s1 = cmd.execute(scene({ assetCollections: [{ id: 'c1', name: 'C1', assetIds: [] }] }))
    expect(s1.assetCollections?.[0].assetIds).toEqual(['a1'])
  })

  it('does not duplicate an existing membership', () => {
    const cmd = makeAddAssetToCollectionCmd('a1', 'c1')
    const s1 = cmd.execute(scene({ assetCollections: [{ id: 'c1', name: 'C1', assetIds: ['a1'] }] }))
    expect(s1.assetCollections?.[0].assetIds).toEqual(['a1'])
  })

  it('removes the asset id from the collection on undo', () => {
    const cmd = makeAddAssetToCollectionCmd('a1', 'c1')
    const s0 = scene({ assetCollections: [{ id: 'c1', name: 'C1', assetIds: [] }] })
    const s2 = cmd.undo(cmd.execute(s0))
    expect(s2.assetCollections?.[0].assetIds).toEqual([])
  })

  it('handles a scene with no collections gracefully', () => {
    const cmd = makeAddAssetToCollectionCmd('a1', 'c1')
    const s1 = cmd.execute(scene())
    expect(s1.assetCollections).toEqual([])
  })
})
