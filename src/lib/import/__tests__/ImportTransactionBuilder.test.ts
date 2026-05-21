import { describe, it, expect } from 'vitest'
import { ImportTransactionBuilder } from '../ImportTransactionBuilder'
import { emptyScene as makeEmptyScene } from '../../defaults'
import type { ImportResult } from '../types'
import type { ChronoScene, Layer, Timeline, Track } from '../../types/core'
import type { Asset } from '../../asset/types'

// ── Fixtures ─────────────────────────────────────────────────────────────────────

function asset(id: string): Asset {
  return { id, name: id, type: 'image', url: `blob:${id}` }
}

function layer(id: string): Layer {
  return {
    id,
    name: id,
    type: 'image',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 },
    opacity: 1,
    image: { assetId: `${id}_asset` },
  } as Layer
}

function track(target: string): Track {
  return { target, keyframes: [] }
}

function timeline(id: string, tracks: Track[] = []): Timeline {
  return { id, durationMs: 5000, autoplay: false, loop: false, tracks }
}

function emptyScene(over: Partial<ChronoScene> = {}): ChronoScene {
  return { ...makeEmptyScene(), ...over }
}

function importResult(over: Partial<ImportResult> = {}): ImportResult {
  return {
    id: 'import_test',
    source: { kind: 'file', value: 'test.png', timestamp: 0 },
    format: 'image/png',
    kind: 'asset',
    assets: [],
    layers: [],
    groups: [],
    tracks: [],
    timelines: [],
    commands: [],
    warnings: [],
    errors: [],
    unsupportedFeatures: [],
    report: {
      title: 'Test', sourceFileName: 'test.png', format: 'image/png',
      created: { assets: 0, layers: 0, groups: 0, tracks: 0, compositions: 0 },
      warnings: [], errors: [], unsupportedFeatures: [], suggestions: [], durationMs: 0,
    },
    ...over,
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('ImportTransactionBuilder', () => {
  const builder = new ImportTransactionBuilder()

  describe('build → execute', () => {
    it('adds assets and layers to the scene', () => {
      const cmd = builder.build(importResult({
        assets: [asset('a1')],
        layers: [layer('l1')],
      }))
      const next = cmd.execute(emptyScene())
      expect(next.assets.map(a => a.id)).toEqual(['a1'])
      expect(next.layers.map(l => l.id)).toEqual(['l1'])
    })

    it('appends to existing scene content', () => {
      const cmd = builder.build(importResult({ assets: [asset('a2')], layers: [layer('l2')] }))
      const next = cmd.execute(emptyScene({ assets: [asset('a1')], layers: [layer('l1')] }))
      expect(next.assets.map(a => a.id)).toEqual(['a1', 'a2'])
      expect(next.layers.map(l => l.id)).toEqual(['l1', 'l2'])
    })

    it('dedupes assets already present by id', () => {
      const cmd = builder.build(importResult({ assets: [asset('a1')] }))
      const next = cmd.execute(emptyScene({ assets: [asset('a1')] }))
      expect(next.assets).toHaveLength(1)
    })

    it('merges tracks into the first timeline', () => {
      const cmd = builder.build(importResult({ tracks: [track('layers.x.opacity')] }))
      const next = cmd.execute(emptyScene({ timelines: [timeline('t1')] }))
      expect(next.timelines[0].tracks.map(t => t.target)).toEqual(['layers.x.opacity'])
    })

    it('dedupes tracks by target when merging', () => {
      const cmd = builder.build(importResult({ tracks: [track('dup')] }))
      const next = cmd.execute(emptyScene({ timelines: [timeline('t1', [track('dup')])] }))
      expect(next.timelines[0].tracks).toHaveLength(1)
    })

    it('adds brand-new timelines from document imports', () => {
      const cmd = builder.build(importResult({ timelines: [timeline('new_tl')] }))
      const next = cmd.execute(emptyScene({ timelines: [timeline('existing')] }))
      expect(next.timelines.map(t => t.id).sort()).toEqual(['existing', 'new_tl'])
    })
  })

  describe('build → undo', () => {
    it('removes the assets and layers it added', () => {
      const cmd = builder.build(importResult({ assets: [asset('a1')], layers: [layer('l1')] }))
      const scene = emptyScene({ assets: [asset('a0')], layers: [layer('l0')] })
      const afterExec = cmd.execute(scene)
      const afterUndo = cmd.undo(afterExec)
      expect(afterUndo.assets.map(a => a.id)).toEqual(['a0'])
      expect(afterUndo.layers.map(l => l.id)).toEqual(['l0'])
    })

    it('round-trips execute → undo back to original ids', () => {
      const cmd = builder.build(importResult({
        assets: [asset('a1'), asset('a2')],
        layers: [layer('l1')],
      }))
      const original = emptyScene()
      const restored = cmd.undo(cmd.execute(original))
      expect(restored.assets).toEqual([])
      expect(restored.layers).toEqual([])
    })
  })

  describe('buildTransaction', () => {
    it('records created ids and metadata', () => {
      const result = importResult({
        assets: [asset('a1')],
        layers: [layer('l1')],
        tracks: [track('t.target')],
      })
      const cmd = builder.build(result)
      const tx = builder.buildTransaction(result, cmd)
      expect(tx.createdAssetIds).toEqual(['a1'])
      expect(tx.createdLayerIds).toEqual(['l1'])
      expect(tx.createdTrackIds).toEqual(['t.target'])
      expect(tx.format).toBe('image/png')
      expect(tx.command).toBe(cmd)
    })
  })

  describe('label generation', () => {
    it('labels single-asset imports with the asset name', () => {
      const cmd = builder.build(importResult({ assets: [{ ...asset('a1'), name: 'logo.png' }] }))
      expect(cmd.label).toBe('Import logo.png')
    })

    it('labels single-layer imports with the layer name', () => {
      const cmd = builder.build(importResult({ layers: [{ ...layer('l1'), name: 'Star' }] }))
      expect(cmd.label).toBe('Import Star')
    })

    it('labels multi-layer imports with a count', () => {
      const cmd = builder.build(importResult({
        source: { kind: 'file', value: 'art.svg', timestamp: 0 },
        layers: [layer('l1'), layer('l2'), layer('l3')],
      }))
      expect(cmd.label).toBe('Import art.svg (3 layers)')
    })
  })
})
