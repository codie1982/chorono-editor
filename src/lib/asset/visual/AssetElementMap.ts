import type { MediaFrameBridge } from '../../render/media/types'
import type { FontBindings } from '../fonts'

/** Compatibility Map surface. Managed consumers additionally resolve video by
 * clip identity; absence of the optional method means legacy per-asset lookup.
 * Native elements are borrowed, not ownership. Async jobs acquire their own pins. */
export interface AssetElementMap extends Map<string, HTMLImageElement | HTMLVideoElement> {
  videoForLayer?(layerId: string, assetId: string): HTMLVideoElement | undefined
  readonly media?: MediaFrameBridge
  readonly fonts?: FontBindings
}
/** Read a clip-specific element without accidentally falling back to a different
 * clip of the same URL in a managed map. Legacy Map callers remain supported. */
export function videoForLayer(assets: AssetElementMap, layerId: string, assetId: string): HTMLVideoElement | undefined {
  return assets.videoForLayer ? assets.videoForLayer(layerId, assetId) : assets.get(assetId) as HTMLVideoElement | undefined
}
