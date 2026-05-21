import { describe, it, expect } from 'vitest'
import { AssetRegistry } from '../AssetRegistry'
import type { Layer } from '../../types/core'
import type { Asset, AssetCollection } from '../types'

// ── Test fixtures ───────────────────────────────────────────────────────────────

function asset(id: string, over: Partial<Asset> = {}): Asset {
  return {
    id,
    name: over.name ?? id,
    type: over.type ?? 'image',
    url: `https://example.com/${id}.png`,
    ...over,
  }
}

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

function collection(id: string, assetIds: string[] = []): AssetCollection {
  return { id, name: id, assetIds }
}

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('AssetRegistry', () => {
  describe('sync + queries', () => {
    it('loads assets, collections and builds the index', () => {
      const r = new AssetRegistry()
      r.sync([asset('a1'), asset('a2')], [collection('c1', ['a1'])], [imageLayer('l1', 'a1')])
      expect(r.getAllAssets()).toHaveLength(2)
      expect(r.getAsset('a1')?.id).toBe('a1')
      expect(r.getAssetsByCollection('c1').map(a => a.id)).toEqual(['a1'])
      expect(r.getUsage('a1').refCount).toBe(1)
    })

    it('getAssetsByType filters by type', () => {
      const r = new AssetRegistry()
      r.sync(
        [asset('a1', { type: 'image' }), asset('a2', { type: 'audio' }), asset('a3', { type: 'image' })],
        [], [],
      )
      expect(r.getAssetsByType('image').map(a => a.id).sort()).toEqual(['a1', 'a3'])
      expect(r.getAssetsByType('audio').map(a => a.id)).toEqual(['a2'])
    })

    it('getUncategorizedAssets excludes assets in any collection', () => {
      const r = new AssetRegistry()
      r.sync([asset('a1'), asset('a2'), asset('a3')], [collection('c1', ['a1'])], [])
      expect(r.getUncategorizedAssets().map(a => a.id).sort()).toEqual(['a2', 'a3'])
    })
  })

  describe('asset mutations', () => {
    it('adds and updates an asset', () => {
      const r = new AssetRegistry()
      r.addAsset(asset('a1', { name: 'original' }))
      r.updateAsset('a1', { name: 'renamed' })
      expect(r.getAsset('a1')?.name).toBe('renamed')
    })

    it('update on missing asset is a no-op', () => {
      const r = new AssetRegistry()
      r.updateAsset('missing', { name: 'x' })
      expect(r.getAsset('missing')).toBeUndefined()
    })

    it('deletes an asset and removes it from collections', () => {
      const r = new AssetRegistry()
      r.sync([asset('a1')], [collection('c1', ['a1'])], [])
      r.deleteAsset('a1')
      expect(r.getAsset('a1')).toBeUndefined()
      expect(r.getCollection('c1')?.assetIds).toEqual([])
    })
  })

  describe('collections', () => {
    it('creates a collection with a unique id', () => {
      const r = new AssetRegistry()
      const c = r.createCollection('My Folder', '#ff0000')
      expect(c.name).toBe('My Folder')
      expect(c.color).toBe('#ff0000')
      expect(r.getCollection(c.id)).toBeDefined()
    })

    it('moves an asset to a collection (removing it from others)', () => {
      const r = new AssetRegistry()
      r.sync([asset('a1')], [collection('c1', ['a1']), collection('c2', [])], [])
      r.moveAssetToCollection('a1', 'c2')
      expect(r.getCollection('c1')?.assetIds).toEqual([])
      expect(r.getCollection('c2')?.assetIds).toEqual(['a1'])
    })

    it('addAssetToCollection does not duplicate', () => {
      const r = new AssetRegistry()
      r.sync([asset('a1')], [collection('c1', [])], [])
      r.addAssetToCollection('a1', 'c1')
      r.addAssetToCollection('a1', 'c1')
      expect(r.getCollection('c1')?.assetIds).toEqual(['a1'])
    })

    it('deleteCollection can migrate assets to another collection', () => {
      const r = new AssetRegistry()
      r.sync([asset('a1')], [collection('c1', ['a1']), collection('c2', [])], [])
      r.deleteCollection('c1', 'c2')
      expect(r.getCollection('c1')).toBeUndefined()
      expect(r.getCollection('c2')?.assetIds).toEqual(['a1'])
    })
  })

  describe('discovery', () => {
    it('findOrphanAssets returns assets with no referencing layer', () => {
      const r = new AssetRegistry()
      r.sync([asset('a1'), asset('a2')], [], [imageLayer('l1', 'a1')])
      expect(r.findOrphanAssets().map(a => a.id)).toEqual(['a2'])
    })

    it('findDuplicateAssets groups by type+name', () => {
      const r = new AssetRegistry()
      r.sync(
        [
          asset('a1', { name: 'logo', type: 'image' }),
          asset('a2', { name: 'logo', type: 'image' }),
          asset('a3', { name: 'logo', type: 'audio' }),
        ],
        [], [],
      )
      const dups = r.findDuplicateAssets()
      expect(dups).toHaveLength(1)
      expect(dups[0].original.id).toBe('a1')
      expect(dups[0].copies.map(a => a.id)).toEqual(['a2'])
    })

    it('buildInventory aggregates totals, types and usage', () => {
      const r = new AssetRegistry()
      r.sync(
        [
          asset('a1', { type: 'image', metadata: { filesize: 100 } }),
          asset('a2', { type: 'audio', metadata: { filesize: 200 } }),
        ],
        [collection('c1', ['a1'])],
        [imageLayer('l1', 'a1')],
      )
      const inv = r.buildInventory()
      expect(inv.totalAssets).toBe(2)
      expect(inv.byType.image).toBe(1)
      expect(inv.byType.audio).toBe(1)
      expect(inv.totalSizeBytes).toBe(300)
      expect(inv.byCollection['c1']).toBe(1)
      expect(inv.orphans.map(a => a.id)).toEqual(['a2'])
      expect(inv.usage['a1'].refCount).toBe(1)
    })
  })

  describe('serialization', () => {
    it('strips runtime fields from serialized assets', () => {
      const r = new AssetRegistry()
      r.addAsset(asset('a1', { runtime: { objectUrl: 'blob:xyz' } }))
      const serialized = r.serializeAssets()
      expect(serialized[0]).not.toHaveProperty('runtime')
      expect(serialized[0].id).toBe('a1')
    })

    it('serializeCollections returns all collections', () => {
      const r = new AssetRegistry()
      r.sync([], [collection('c1'), collection('c2')], [])
      expect(r.serializeCollections().map(c => c.id).sort()).toEqual(['c1', 'c2'])
    })
  })
})
