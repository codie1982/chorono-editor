import { describe, it, expect } from 'vitest'
import { AssetIndex } from '../AssetIndex'
import type { Layer } from '../../types/core'
import type { Asset } from '../types'

// ── Test fixtures ───────────────────────────────────────────────────────────────

function imageLayer(id: string, assetId: string): Layer {
  return {
    id,
    name: id,
    type: 'image',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 },
    opacity: 1,
    image: { assetId },
  } as Layer
}

function videoLayer(id: string, assetId: string): Layer {
  return {
    id,
    name: id,
    type: 'video',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 },
    opacity: 1,
    video: { assetId },
  } as Layer
}

function audioLayer(id: string, assetId: string): Layer {
  return {
    id,
    name: id,
    type: 'audio',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 },
    opacity: 1,
    audio: { assetId },
  } as Layer
}

function shapeLayer(id: string): Layer {
  return {
    id,
    name: id,
    type: 'shape',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 },
    opacity: 1,
  } as Layer
}

function asset(id: string): Asset {
  return { id, name: id, type: 'image', url: `blob:${id}` }
}

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('AssetIndex', () => {
  describe('build', () => {
    it('indexes image/video/audio asset references', () => {
      const idx = new AssetIndex()
      idx.build([
        imageLayer('l1', 'a1'),
        videoLayer('l2', 'a2'),
        audioLayer('l3', 'a3'),
      ])
      expect(idx.getLayerIds('a1')).toEqual(['l1'])
      expect(idx.getLayerIds('a2')).toEqual(['l2'])
      expect(idx.getLayerIds('a3')).toEqual(['l3'])
    })

    it('maps multiple layers to the same asset', () => {
      const idx = new AssetIndex()
      idx.build([imageLayer('l1', 'shared'), imageLayer('l2', 'shared')])
      expect(idx.getLayerIds('shared').sort()).toEqual(['l1', 'l2'])
      expect(idx.getRefCount('shared')).toBe(2)
    })

    it('ignores layers without asset references', () => {
      const idx = new AssetIndex()
      idx.build([shapeLayer('s1'), imageLayer('l1', 'a1')])
      expect(idx.getRefCount('a1')).toBe(1)
      expect(idx.getLayerIds('nonexistent')).toEqual([])
    })

    it('clears prior state when rebuilt', () => {
      const idx = new AssetIndex()
      idx.build([imageLayer('l1', 'a1')])
      idx.build([imageLayer('l2', 'a2')])
      expect(idx.getRefCount('a1')).toBe(0)
      expect(idx.getRefCount('a2')).toBe(1)
    })
  })

  describe('incremental add/remove', () => {
    it('adds a layer reference', () => {
      const idx = new AssetIndex()
      idx.addLayer(imageLayer('l1', 'a1'))
      expect(idx.getLayerIds('a1')).toEqual(['l1'])
    })

    it('removes a layer reference and prunes empty asset entries', () => {
      const idx = new AssetIndex()
      idx.addLayer(imageLayer('l1', 'a1'))
      idx.removeLayer(imageLayer('l1', 'a1'))
      expect(idx.getRefCount('a1')).toBe(0)
      expect(idx.isOrphan('a1')).toBe(true)
    })

    it('keeps asset entry while other layers still reference it', () => {
      const idx = new AssetIndex()
      idx.addLayer(imageLayer('l1', 'shared'))
      idx.addLayer(imageLayer('l2', 'shared'))
      idx.removeLayer(imageLayer('l1', 'shared'))
      expect(idx.getLayerIds('shared')).toEqual(['l2'])
    })
  })

  describe('orphan detection', () => {
    it('reports an asset with no referencing layer as orphan', () => {
      const idx = new AssetIndex()
      idx.build([imageLayer('l1', 'a1')])
      expect(idx.isOrphan('a1')).toBe(false)
      expect(idx.isOrphan('a2')).toBe(true)
    })

    it('getOrphanIds returns only unreferenced assets', () => {
      const idx = new AssetIndex()
      idx.build([imageLayer('l1', 'a1')])
      const orphans = idx.getOrphanIds([asset('a1'), asset('a2'), asset('a3')])
      expect(orphans.sort()).toEqual(['a2', 'a3'])
    })
  })

  describe('usage', () => {
    it('returns usage with refCount and layerIds', () => {
      const idx = new AssetIndex()
      idx.build([imageLayer('l1', 'a1'), imageLayer('l2', 'a1')])
      const usage = idx.getUsage('a1')
      expect(usage.assetId).toBe('a1')
      expect(usage.refCount).toBe(2)
      expect(usage.layerIds.sort()).toEqual(['l1', 'l2'])
    })

    it('getAllUsage maps every asset', () => {
      const idx = new AssetIndex()
      idx.build([imageLayer('l1', 'a1')])
      const all = idx.getAllUsage([asset('a1'), asset('a2')])
      expect(all['a1'].refCount).toBe(1)
      expect(all['a2'].refCount).toBe(0)
    })
  })

  describe('clear', () => {
    it('empties the index', () => {
      const idx = new AssetIndex()
      idx.build([imageLayer('l1', 'a1')])
      idx.clear()
      expect(idx.getRefCount('a1')).toBe(0)
    })
  })
})
