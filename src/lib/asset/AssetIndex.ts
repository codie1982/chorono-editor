// ── AssetIndex ────────────────────────────────────────────────────────────────
//
// Maintains a reverse index: assetId → layerIds
// Rebuilt from scene on demand, or incrementally updated.
//
// Used by AssetRegistry and AssetDiscovery to efficiently answer:
//   - "Which layers reference this asset?"
//   - "Is this asset an orphan?"

import { modelAssetIds } from '../model3d/content/modelContent'
import type { Composition, Layer }  from '../types/core'
import type { Asset }  from './types'
import type { AssetUsage } from './types'

/** Mutable reverse source-reference index; no media handles are retained.
 * Layer IDs and the optional composition paint reference are distinct owners.
 * Inactive image paint still counts so orphan cleanup cannot delete a source
 * that switching back to Image will reuse. Call build after composition edits. */
export class AssetIndex {
  /** assetId → set of layerIds */
  private index = new Map<string, Set<string>>()
  private backgroundId?: string

  /**
   * Rebuild source references, including optional active/inactive background paint.
   */
  build(layers: Layer[], composition?: Composition): void {
    this.index.clear()
    this.backgroundId = composition?.backgroundFill?.image?.assetId
    for (const layer of layers) {
      const assetIds = this.extractAssetIds(layer)
      for (const assetId of assetIds) {
        if (!this.index.has(assetId)) this.index.set(assetId, new Set())
        this.index.get(assetId)!.add(layer.id)
      }
    }
  }

  /**
   * Add or update a single layer's asset references.
   */
  addLayer(layer: Layer): void {
    const assetIds = this.extractAssetIds(layer)
    for (const assetId of assetIds) {
      if (!this.index.has(assetId)) this.index.set(assetId, new Set())
      this.index.get(assetId)!.add(layer.id)
    }
  }

  /**
   * Remove a layer's references from the index.
   */
  removeLayer(layer: Layer): void {
    const assetIds = this.extractAssetIds(layer)
    for (const assetId of assetIds) {
      const set = this.index.get(assetId)
      if (set) {
        set.delete(layer.id)
        if (set.size === 0) this.index.delete(assetId)
      }
    }
  }

  /**
   * Get all layer IDs that reference this asset.
   */
  getLayerIds(assetId: string): string[] {
    return Array.from(this.index.get(assetId) ?? [])
  }

  /**
   * Get reference count for an asset.
   */
  getRefCount(assetId: string): number {
    return (this.index.get(assetId)?.size ?? 0) + Number(this.hasCompositionReference(assetId))
  }

  /**
   * Returns true if neither layers nor the composition reference this asset.
   */
  isOrphan(assetId: string): boolean {
    return this.getRefCount(assetId) === 0
  }

  /**
   * Get all orphan asset IDs given the full asset list.
   */
  getOrphanIds(assets: Asset[]): string[] {
    return assets
      .filter(a => this.isOrphan(a.id))
      .map(a => a.id)
  }

  /**
   * Get usage data for a specific asset.
   */
  getUsage(assetId: string): AssetUsage {
    const layerIds = this.getLayerIds(assetId)
    return {
      assetId,
      layerIds,
      refCount: this.getRefCount(assetId),
    }
  }

  /**
   * Get usage map for all assets.
   */
  getAllUsage(assets: Asset[]): Record<string, AssetUsage> {
    const result: Record<string, AssetUsage> = {}
    for (const asset of assets) {
      result[asset.id] = this.getUsage(asset.id)
    }
    return result
  }

  /** Background ownership is distinct from layer IDs, including inactive paint. */
  hasCompositionReference(assetId: string): boolean { return this.backgroundId === assetId }

  /** Clear the index */
  clear(): void {
    this.index.clear(); this.backgroundId = undefined
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private extractAssetIds(layer: Layer): string[] {
    const ids: string[] = []
    ids.push(...modelAssetIds(layer.model3d))
    if (layer.style?.fill?.image?.assetId) ids.push(layer.style.fill.image.assetId)
    if (layer.image?.assetId)  ids.push(layer.image.assetId)
    if (layer.video?.assetId)  ids.push(layer.video.assetId)
    if (layer.audio?.assetId)  ids.push(layer.audio.assetId)
    return ids
  }
}
