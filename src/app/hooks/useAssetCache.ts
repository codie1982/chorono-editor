'use client'
import { useEffect, useRef, useState } from 'react'
import type { Asset } from '@/lib/types'
import { assetSourcePool } from '@/lib/asset/sources'
import type { FontAssetService } from '@/lib/asset/fonts'
import { VisualMediaSession } from '@/lib/render/media/VisualMediaSession'
import type { AssetElementMap } from '@/lib/asset/visual/AssetElementMap'
import type { VisualAssetService } from '@/lib/asset/visual'
export type AssetCache = AssetElementMap

/**
 * One editor consumer's borrowed media view. managed mode waits for the actual
 * renderer frame demand; ordinary legacy hosts explicitly preload their asset
 * list through the same bounded service. Each ready/source change invalidates
 * React; the host renderer schedules a new frame. Original URL ownership stays
 * in document/history/jobs. Independent async jobs MUST acquire their own pins.
 * Font registration shares the bounded font service; this hook owns consumer
 * pins only. Font memory is opaque and its admission charge is a policy estimate.
 * Construction has no native side effects; setup/cleanup supports StrictMode.
 */
export function useAssetCache(assets: Asset[], options: { managed?: boolean; service?: VisualAssetService; fontService?:FontAssetService } = {}): AssetCache {
  const owner = useRef<VisualMediaSession | null>(null)
  if (!owner.current) owner.current = new VisualMediaSession(options.service,options.fontService)
  const session = owner.current
  const managed = useRef(options.managed === true)
  managed.current = options.managed === true
  const [cache, setCache] = useState<AssetCache>(() => session.elements(managed.current))
  useEffect(() => {
    session.start(() => setCache(session.elements(managed.current)))
    setCache(session.elements(managed.current))
    return () => session.stop()
  }, [session])
  useEffect(() => {
    const source = assetSourcePool.retainAssets(assets)
    // Active renderer requests replace this empty managed set on the next frame.
    session.setDemand(options.managed ? [] : assets.filter(asset => ['image', 'spriteSheet', 'video', 'font'].includes(asset.type)).map(asset => ({
      key: JSON.stringify([asset.id, asset.url]), asset, required: true,
      layerId: asset.type === 'video' ? `legacy:${asset.id}` : undefined,
    })))
    return () => source.release()
  }, [assets, options.managed, session])
  return cache
}
