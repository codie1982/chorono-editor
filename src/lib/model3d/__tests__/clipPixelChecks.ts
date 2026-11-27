import type { ChronoScene } from '../../types'
import type { OverrideMap } from '../../evaluator'
import type { AssetElementMap } from '../../asset/visual/AssetElementMap'
import { withMediaFrame } from '../../render/media/withMediaFrame'
import { drawViewportFrame } from '@/components/canvas/render/drawViewportFrame'
import type { Model3DData, Model3DResource } from '../types'

/** Test-owned native RGBA capture. Bitmaps/canvas storage are destroyed before
 * return; the detached byte copy is QA evidence and never scene/history data. */
export async function pngPixels(blob: Blob): Promise<Uint8ClampedArray> {
  const image = await createImageBitmap(blob), canvas = document.createElement('canvas')
  canvas.width = image.width; canvas.height = image.height
  try { const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0); return context.getImageData(0, 0, canvas.width, canvas.height).data }
  finally { image.close(); canvas.width = canvas.height = 0 }
}

/** Execute the production viewport draw adapter with a prepared, final frame.
 * Clean full-composition view at unit backing scale: no selection/grid/ghosts,
 * no pan clipping. Low-zoom LOD is deliberately enabled to catch frozen content.
 * Preparation pins stay alive through the synchronous draw/pixel read.
 */
export async function viewportPixels(scene: ChronoScene, timeMs: number, overrides: OverrideMap): Promise<Uint8ClampedArray> {
  const canvas = document.createElement('canvas'); canvas.width = scene.composition.width; canvas.height = scene.composition.height
  try {
    return await withMediaFrame(scene, timeMs, canvas.getContext('2d')!, { overrides }, assets => {
      drawCleanViewport(canvas, scene, timeMs, overrides, assets)
      return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    })
  } finally { canvas.width = canvas.height = 0 }
}

/** Same options as a clean paused editor frame, without a second evaluation. */
export function drawCleanViewport(canvas: HTMLCanvasElement, scene: ChronoScene, timeMs: number, overrides: OverrideMap, assets: AssetElementMap): void {
  drawViewportFrame(canvas, { scene, timeMs, overrides, assets, viewportScale: .5, selectedLayerId: null,
    selectedLayerIds: new Set(), snapEnabled: false, snapToGridOn: false, gridSize: 10, dragOverrides: new Map(), hideEditorUI: true })
}

/** Full-channel comparison, not a checksum or a few hand-picked pixels. */
export function pixelDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): { changed: number; max: number } {
  if (a.length !== b.length) throw new Error('Pixel capture dimensions differ.')
  let changed = 0, max = 0
  for (let i = 0; i < a.length; i++) { const delta = Math.abs(a[i] - b[i]); if (delta) changed++; max = Math.max(max, delta) }
  return { changed, max }
}

/** Test the prepared resource's synchronous pose/camera/light reset directly.
 * Caller must retain its lease through this draw; output is QA-owned RGBA8. */
export function preparedModelPixels(resource: Model3DResource, data: Model3DData): Uint8ClampedArray {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96
  try { const context = canvas.getContext('2d')!; resource.draw(context, data, 96, 96); return context.getImageData(0, 0, 96, 96).data }
  finally { canvas.width = canvas.height = 0 }
}

/** Display a borrowed QA byte frame as native pixels without retaining bitmap
 * handles. UI owns the canvas and clears its backing on teardown. */
export function showFrame(target: HTMLCanvasElement, pixels: Uint8ClampedArray, width: number, height: number): void {
  target.width = width; target.height = height
  target.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0)
}
