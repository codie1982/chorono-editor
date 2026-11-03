'use client'
import { useEffect, useRef, useState } from 'react'
import type { Asset } from '@/lib/types'

/** Loaded asset element keyed by Asset.id. */
export type AssetCache = Map<string, HTMLImageElement | HTMLVideoElement>

/**
 * Loads images / videos referenced by `scene.assets` and revokes blob URLs
 * when assets are removed. The returned `cache` is a state value — when it
 * changes, the canvas should re-render.
 *
 * Why not just use a ref? Because the renderer needs to react when an image
 * finishes loading (initial paint shows nothing until the cache entry exists).
 */
export function useAssetCache(assets: Asset[]): AssetCache {
  const [cache, setCache] = useState<AssetCache>(() => new Map())
  // Track URLs we created so we can revoke them on removal
  const ownedUrlsRef = useRef<Set<string>>(new Set())
  const fontsRef = useRef(new Map<string, { url: string; face: FontFace }>())

  useEffect(() => {
    let cancelled = false

    const currentIds = new Set(assets.map((a) => a.id))
    fontsRef.current.forEach((font, id) => {
      if (currentIds.has(id)) return
      document.fonts.delete(font.face)
      fontsRef.current.delete(id)
    })

    // ── Remove cache entries for assets no longer in scene ─────────────────
    let changed = false
    const next = new Map(cache)
    Array.from(next.keys()).forEach((id) => {
      if (currentIds.has(id)) return
      const el = next.get(id)
      // Undo history can still reference removed assets; retain owned URLs until unmount.
      if (el && el instanceof HTMLVideoElement) el.pause()
      next.delete(id)
      changed = true
    })

    // ── Load any new assets we don't have yet ──────────────────────────────
    const newLoads: Promise<void>[] = []
    for (const asset of assets) {
      const cached = next.get(asset.id)
      if (cached?.getAttribute('src') === asset.url) continue
      if (cached) {
        if (cached instanceof HTMLVideoElement) cached.pause()
        next.delete(asset.id)
        changed = true
      }
      if (asset.type === 'font') {
        const old = fontsRef.current.get(asset.id)
        if (old?.url === asset.url) continue
        if (old) document.fonts.delete(old.face)
        const family = asset.metadata?.notes?.match(/^family: (.+)$/)?.[1]
        if (!family) continue
        const face = new FontFace(family, `url(${JSON.stringify(asset.url)})`)
        fontsRef.current.set(asset.id, { url: asset.url, face })
        document.fonts.add(face)
        if (asset.url.startsWith('blob:')) ownedUrlsRef.current.add(asset.url)
        newLoads.push(face.load().then(() => {}).catch(() => {}))
        continue
      }

      if (asset.type === 'image' || asset.type === 'spriteSheet') {
        // Sprite-sheet assets (BL-07) load like images — the FrameSequence
        // renderer slices frames out of the loaded HTMLImageElement.
        const img = new Image()
        const p = new Promise<void>((resolve) => {
          img.onload  = () => resolve()
          img.onerror = () => resolve()
        })
        if (asset.url.startsWith('blob:')) ownedUrlsRef.current.add(asset.url)
        img.src = asset.url
        next.set(asset.id, img)
        newLoads.push(p)
        changed = true
      } else if (asset.type === 'video') {
        const video = document.createElement('video')
        video.muted    = true
        video.playsInline = true
        video.preload  = 'auto'
        const p = new Promise<void>((resolve) => {
          video.onloadeddata = () => resolve()
          video.onerror      = () => resolve()
        })
        if (asset.url.startsWith('blob:')) ownedUrlsRef.current.add(asset.url)
        video.src = asset.url
        next.set(asset.id, video)
        newLoads.push(p)
        changed = true
      }
      // audio is not in this cache — handled separately by an AudioEngine
    }

    if (changed) setCache(next)

    // Once images finish decoding, force a re-render so the canvas picks them up
    if (newLoads.length > 0) {
      Promise.all(newLoads).then(() => {
        if (!cancelled) setCache((c) => new Map(c))
      })
    }

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets])

  // ── Final cleanup on unmount: revoke every blob URL we created ───────────
  useEffect(() => {
    const owned = ownedUrlsRef.current
    const fonts = fontsRef.current
    return () => {
      owned.forEach((url) => URL.revokeObjectURL(url))
      owned.clear()
      fonts.forEach(font => document.fonts.delete(font.face))
      fonts.clear()
    }
  }, [])

  return cache
}
