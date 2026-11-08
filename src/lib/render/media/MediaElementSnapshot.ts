import type { AssetElementMap } from '../../asset/visual/AssetElementMap'
import type { MediaFrameBridge } from './types'
import type { FontBindings } from '../../asset/fonts'

export interface MediaElementRecord {
  assetId: string; layerId?: string; element: HTMLImageElement | HTMLVideoElement
  /** Exact originating consumer still owns its pin; never acquire while reading. */
  live(): boolean
}
/** Borrowed ready-element view. Old scheduled paints cannot use a replaced or
 * released consumer just because they captured an earlier Map. Map iteration is
 * diagnostic compatibility only; asynchronous consumers own separate sessions.
 * This snapshot owns records/DOM references, never leases or decoded lifetime. */
export class MediaElementSnapshot extends Map<string, HTMLImageElement | HTMLVideoElement> implements AssetElementMap {
  declare private readonly images: Map<string, MediaElementRecord>
  declare private readonly videos: Map<string, MediaElementRecord>
  declare readonly media?: MediaFrameBridge
  declare readonly fonts?: FontBindings
  /** Preserve Map serialization/iteration shape: bridge and owner records are
   * non-enumerable runtime state, never accidental JSON source metadata. */
  constructor(records: readonly MediaElementRecord[], media?: MediaFrameBridge, fonts?: FontBindings) {
    super()
    Object.defineProperties(this, {
      media: { value: media, enumerable: false },
      fonts: { value: fonts, enumerable: false },
      images: { value: new Map<string, MediaElementRecord>(), enumerable: false },
      videos: { value: new Map<string, MediaElementRecord>(), enumerable: false },
    })
    records.forEach(record => {
      if (record.layerId) this.videos.set(record.layerId, record)
      if (!this.images.has(record.assetId)) { this.images.set(record.assetId, record); super.set(record.assetId, record.element) }
    })
  }
  /** Does not expose a stale element after this exact source consumer left. */
  get(assetId: string): HTMLImageElement | HTMLVideoElement | undefined {
    const record = this.images.get(assetId); return record?.live() ? record.element : undefined
  }
  /** Legacy Map mutation remains local to this snapshot. The external caller
   * owns inserted native handles; insertion does not manufacture a managed pin. */
  set(assetId: string, element: HTMLImageElement | HTMLVideoElement): this {
    this.images.set(assetId, { assetId, element, live: () => true })
    return super.set(assetId, element)
  }
  /** Delete the local alias and any derived clip lookups for that source. */
  delete(assetId: string): boolean {
    this.images.delete(assetId)
    this.videos.forEach((record, id) => { if (record.assetId === assetId) this.videos.delete(id) })
    return super.delete(assetId)
  }
  /** A caller may clear its borrowed view without releasing another owner's pin. */
  clear(): void { this.images.clear(); this.videos.clear(); super.clear() }
  /** A missing clip never falls back to another clip's clock. */
  videoForLayer(layerId: string, assetId: string): HTMLVideoElement | undefined {
    const fallback = this.images.get(assetId)
    const record = this.videos.get(layerId) ?? (fallback?.layerId?.startsWith('legacy:') ? fallback : undefined)
    return record?.assetId === assetId && record.live() ? record.element as HTMLVideoElement : undefined
  }
}
