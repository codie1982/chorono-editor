'use client'
import { useEffect, useRef } from 'react'
import type { Asset } from '@/lib/types'

/** Borrowed source preview, mounted only for a windowed inventory card.
 * Owns its video element/decoder request, never its source URL. Unmount pauses
 * and detaches the element's source; undo and other consumers keep the URL.
 * This is a thumbnail lifecycle adapter, not full editor media admission. */
export default function AssetThumbnail({ asset }: { asset: Asset }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const video = videoRef.current, url = asset.url
    return () => {
      if (!video) return
      video.pause()
      // A URL replacement may already have updated the same DOM element.
      if (video.getAttribute('src') === url) { video.removeAttribute('src'); video.load() }
    }
  }, [asset.url])
  if (asset.type === 'image') return <img src={asset.url} alt={asset.name} loading="lazy" decoding="async"
    className="max-w-full max-h-full object-contain" />
  if (asset.type === 'video') return <video ref={videoRef} src={asset.url} muted playsInline preload="metadata"
    aria-label={asset.name} className="max-w-full max-h-full object-contain" />
  return null
}
