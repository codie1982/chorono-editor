import type { DragEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Asset } from '@/lib/types'
import { acceptTextureDrag, droppedTexture, startTextureDrag } from './textureAssetDrag'

const image: Asset = { id: 'image-1', name: 'Image', type: 'image', url: 'blob:image-1' }
const audio: Asset = { id: 'audio-1', name: 'Audio', type: 'audio', url: 'blob:audio-1' }

/** Simulate the browser's type-only dragover and id-bearing drop phases. */
function dragEvent(types: string[], id = ''): DragEvent {
  return {
    dataTransfer: {
      types,
      effectAllowed: 'none',
      dropEffect: 'none',
      setData: vi.fn((type: string, value: string) => { types.push(type); id = value }),
      getData: vi.fn(() => id),
    },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as DragEvent
}

describe('Mesh2D texture asset drag', () => {
  it('transfers an image by id and resolves it against current scene assets', () => {
    const event = dragEvent([])
    startTextureDrag(event, image)
    acceptTextureDrag(event)

    expect(event.dataTransfer.effectAllowed).toBe('copy')
    expect(event.dataTransfer.dropEffect).toBe('copy')
    expect(droppedTexture(event, [audio, image])).toBe(image)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.stopPropagation).toHaveBeenCalled()
  })

  it('does not intercept external drops or assign stale and incompatible assets', () => {
    const external = dragEvent(['Files'])
    acceptTextureDrag(external)
    expect(droppedTexture(external, [image])).toBeUndefined()
    expect(external.preventDefault).not.toHaveBeenCalled()

    const stale = dragEvent(['application/x-chorono-texture-asset'], 'image-1')
    expect(droppedTexture(stale, [audio])).toBeUndefined()
    const incompatible = dragEvent([])
    startTextureDrag(incompatible, audio)
    expect(incompatible.dataTransfer.types).toEqual([])
  })
})
