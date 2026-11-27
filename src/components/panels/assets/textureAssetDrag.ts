import type { DragEvent } from 'react'
import type { Asset } from '@/lib/types'

const textureMime = 'application/x-chorono-texture-asset'

/** The texture sampler accepts image resources and whole sprite sheets. */
export function isTextureAsset(asset: Asset): boolean {
  return asset.type === 'image' || asset.type === 'spriteSheet'
}

/** Carry only a project asset id. Keep native file import and layer drags separate. */
export function startTextureDrag(event: DragEvent, asset: Asset): void {
  if (!isTextureAsset(asset)) return
  event.dataTransfer.setData(textureMime, asset.id)
  event.dataTransfer.effectAllowed = 'copy'
}

/** Browsers expose only MIME types during dragover. Resolve against the receiving scene at drop time. */
export function acceptTextureDrag(event: DragEvent): void {
  if (!event.dataTransfer.types.includes(textureMime)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'copy'
}

/** Consume an internal drop only when it uses the texture MIME type. */
export function droppedTexture(event: DragEvent, assets: readonly Asset[]): Asset | undefined {
  if (!event.dataTransfer.types.includes(textureMime)) return
  event.preventDefault()
  event.stopPropagation()
  const id = event.dataTransfer.getData(textureMime)
  return assets.find(asset => asset.id === id && isTextureAsset(asset))
}
