// ── Asset Registry Types ──────────────────────────────────────────────────────
//
// Re-exports the canonical Asset / AssetType from types/media.ts (which is the
// single source of truth used by ChronoScene.assets[]).
//
// Adds collection, discovery, and inventory types that are not part of the
// core scene model but are used by the AssetRegistry and AssetDiscovery tools.

// ── Re-exports from canonical source ─────────────────────────────────────────

export type {
  Asset,
  AssetType,
  AssetStorage,
  AssetStorageMode,
  AssetMetadata,
  AssetRuntime,
} from '../types/media'

// ── Asset Collection ──────────────────────────────────────────────────────────

export interface AssetCollection {
  id: string
  name: string
  color?: string
  /** IDs of assets in this collection (no duplication of asset objects) */
  assetIds: string[]
}

// ── Asset Usage (from Discovery) ─────────────────────────────────────────────

export interface AssetUsage {
  assetId: string
  /** Layer IDs that reference this asset */
  layerIds: string[]
  /** Total reference count */
  refCount: number
}

export interface AssetDuplicate {
  /** The "original" asset (first seen) */
  original: import('../types/media').Asset
  /** Assets with identical content */
  copies: import('../types/media').Asset[]
}

// ── Asset Inventory (from Discovery) ─────────────────────────────────────────

export interface AssetInventory {
  totalAssets: number
  byType: Partial<Record<import('../types/media').AssetType, number>>
  byCollection: Record<string, number>
  totalSizeBytes: number

  orphans: import('../types/media').Asset[]
  duplicates: AssetDuplicate[]
  usage: Record<string, AssetUsage>
}

// ── Delete Options ────────────────────────────────────────────────────────────

export interface DeleteAssetOptions {
  /** Also delete all layers that reference this asset */
  cascadeDeleteLayers?: boolean
  /** Revoke blob URL if present */
  revokeUrl?: boolean
}
