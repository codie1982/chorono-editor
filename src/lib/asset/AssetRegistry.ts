// ── AssetRegistry ─────────────────────────────────────────────────────────────
//
// Central registry for all imported assets in a Chorono scene.
// Manages assets, collections, reverse indexing, and discovery.
//
// IMPORTANT: This class is NOT React state — it's a pure data manager.
// Use useAssetRegistry hook to sync it with scene.assets in React.

import type { Layer }      from '../types/core'
import type {
  Asset,
  AssetType,
  AssetCollection,
  AssetUsage,
  AssetDuplicate,
  AssetInventory,
  DeleteAssetOptions,
} from './types'
import { AssetIndex } from './AssetIndex'

// ── Registry ──────────────────────────────────────────────────────────────────

export class AssetRegistry {
  private assets      = new Map<string, Asset>()
  private collections = new Map<string, AssetCollection>()
  private index       = new AssetIndex()

  // ── Initialization ────────────────────────────────────────────────────────

  /**
   * Sync registry from scene data.
   * Call this when scene is loaded or replaced.
   */
  sync(assets: Asset[], collections: AssetCollection[], layers: Layer[]): void {
    this.assets.clear()
    this.collections.clear()
    for (const asset of assets) this.assets.set(asset.id, asset)
    for (const col of collections) this.collections.set(col.id, col)
    this.index.build(layers)
  }

  // ── Asset Queries ─────────────────────────────────────────────────────────

  getAsset(id: string): Asset | undefined {
    return this.assets.get(id)
  }

  getAllAssets(): Asset[] {
    return Array.from(this.assets.values())
  }

  getAssetsByType(type: AssetType): Asset[] {
    return this.getAllAssets().filter(a => a.type === type)
  }

  getAssetsByCollection(collectionId: string): Asset[] {
    const col = this.collections.get(collectionId)
    if (!col) return []
    return col.assetIds
      .map(id => this.assets.get(id))
      .filter((a): a is Asset => a !== undefined)
  }

  /** Assets not in any collection */
  getUncategorizedAssets(): Asset[] {
    const inCollections = new Set<string>()
    this.collections.forEach(col => col.assetIds.forEach(id => inCollections.add(id)))
    return this.getAllAssets().filter(a => !inCollections.has(a.id))
  }

  hasAsset(id: string): boolean {
    return this.assets.has(id)
  }

  // ── Asset Mutations ───────────────────────────────────────────────────────

  addAsset(asset: Asset): void {
    this.assets.set(asset.id, asset)
  }

  addAssets(assets: Asset[]): void {
    for (const a of assets) this.addAsset(a)
  }

  updateAsset(id: string, patch: Partial<Asset>): void {
    const existing = this.assets.get(id)
    if (!existing) return
    this.assets.set(id, { ...existing, ...patch })
  }

  deleteAsset(id: string, options: DeleteAssetOptions = {}): void {
    const asset = this.assets.get(id)
    if (!asset) return

    // Revoke blob URL
    if (options.revokeUrl !== false && asset.url?.startsWith('blob:')) {
      URL.revokeObjectURL(asset.url)
    }
    if (asset.runtime?.objectUrl) {
      URL.revokeObjectURL(asset.runtime.objectUrl)
    }

    // Remove from collections
    this.collections.forEach(col => {
      const idx = col.assetIds.indexOf(id)
      if (idx !== -1) col.assetIds.splice(idx, 1)
    })

    this.assets.delete(id)
  }

  // ── Collection Queries ────────────────────────────────────────────────────

  getCollection(id: string): AssetCollection | undefined {
    return this.collections.get(id)
  }

  getAllCollections(): AssetCollection[] {
    return Array.from(this.collections.values())
  }

  // ── Collection Mutations ──────────────────────────────────────────────────

  createCollection(name: string, color?: string): AssetCollection {
    const id = `col_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const col: AssetCollection = { id, name, color, assetIds: [] }
    this.collections.set(id, col)
    return col
  }

  deleteCollection(id: string, moveAssetsTo?: string): void {
    const col = this.collections.get(id)
    if (!col) return
    if (moveAssetsTo) {
      const target = this.collections.get(moveAssetsTo)
      if (target) {
        for (const assetId of col.assetIds) {
          if (!target.assetIds.includes(assetId)) {
            target.assetIds.push(assetId)
          }
        }
      }
    }
    this.collections.delete(id)
  }

  moveAssetToCollection(assetId: string, collectionId: string): void {
    // Remove from current collection(s)
    this.collections.forEach(col => {
      const idx = col.assetIds.indexOf(assetId)
      if (idx !== -1) col.assetIds.splice(idx, 1)
    })
    // Add to target
    const target = this.collections.get(collectionId)
    if (target && !target.assetIds.includes(assetId)) {
      target.assetIds.push(assetId)
    }
  }

  addAssetToCollection(assetId: string, collectionId: string): void {
    const col = this.collections.get(collectionId)
    if (col && !col.assetIds.includes(assetId)) {
      col.assetIds.push(assetId)
    }
  }

  // ── Index Sync ────────────────────────────────────────────────────────────

  /** Call when layers change to keep reverse index current */
  rebuildIndex(layers: Layer[]): void {
    this.index.build(layers)
  }

  addLayerToIndex(layer: Layer): void {
    this.index.addLayer(layer)
  }

  removeLayerFromIndex(layer: Layer): void {
    this.index.removeLayer(layer)
  }

  // ── Discovery ─────────────────────────────────────────────────────────────

  getUsage(assetId: string): AssetUsage {
    return this.index.getUsage(assetId)
  }

  getLayerIds(assetId: string): string[] {
    return this.index.getLayerIds(assetId)
  }

  isOrphan(assetId: string): boolean {
    return this.index.isOrphan(assetId)
  }

  findOrphanAssets(): Asset[] {
    return this.getAllAssets().filter(a => this.index.isOrphan(a.id))
  }

  findDuplicateAssets(): AssetDuplicate[] {
    const byName = new Map<string, Asset[]>()
    this.assets.forEach(asset => {
      const key = `${asset.type}:${asset.name}`
      if (!byName.has(key)) byName.set(key, [])
      byName.get(key)!.push(asset)
    })
    const duplicates: AssetDuplicate[] = []
    byName.forEach(group => {
      if (group.length > 1) {
        duplicates.push({ original: group[0], copies: group.slice(1) })
      }
    })
    return duplicates
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  buildInventory(): AssetInventory {
    const all = this.getAllAssets()
    const byType: Record<string, number> = {}
    const byCollection: Record<string, number> = {}
    let totalSizeBytes = 0

    for (const asset of all) {
      byType[asset.type] = (byType[asset.type] ?? 0) + 1
      totalSizeBytes += asset.metadata?.filesize ?? 0
    }

    this.collections.forEach(col => {
      byCollection[col.name] = col.assetIds.length
    })

    return {
      totalAssets: all.length,
      byType: byType as Record<AssetType, number>,
      byCollection,
      totalSizeBytes,
      orphans: this.findOrphanAssets(),
      duplicates: this.findDuplicateAssets(),
      usage: this.index.getAllUsage(all),
    }
  }

  // ── Serialization ─────────────────────────────────────────────────────────

  /** Export assets for scene JSON — strips runtime fields */
  serializeAssets(): Asset[] {
    return this.getAllAssets().map(({ runtime: _runtime, ...rest }) => rest)
  }

  serializeCollections(): AssetCollection[] {
    return this.getAllCollections()
  }
}

/** Module-level singleton — replaced when scene changes */
export const assetRegistry = new AssetRegistry()
