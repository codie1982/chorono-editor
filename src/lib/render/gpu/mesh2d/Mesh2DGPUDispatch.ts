import { getLayerValue } from '@/lib/evaluator'
import {
  mesh2DTextureSourceDimensions,
  resolveMesh2DTexturePlacement,
} from '@/lib/mesh2d/Mesh2DTextureMapping'
import type { RenderContext } from '@/lib/render/RenderContext'
import { gpuCapabilities } from '@/lib/render/gpu/GPUCapabilities'
import type { Layer } from '@/lib/types'
import type { Mesh2DGPUBackend } from './Mesh2DGPUBackend'
import { Mesh2DGPUCompositor } from './Mesh2DGPUCompositor'
import { Mesh2DGPUVertexConverter } from './Mesh2DGPUVertexConverter'
import { WebGLMesh2DBackend } from './WebGLMesh2DBackend'

export type Mesh2DGPURenderResult = 'rendered' | 'fallback-unavailable' | 'fallback-invalid' | 'fallback-filter'

let backend: Mesh2DGPUBackend | null = null
let attempted = false

/**
 * Attempts a complete textured Mesh2D GPU pass and reports why Canvas2D should
 * take over. The app-lifetime backend owns native resources and is created only
 * after a browser capability probe. Invalid placement never produces partial
 * GPU output. Legacy Canvas filters remain on the Canvas path because applying
 * them to a full-backing GPU surface would change their coordinate semantics.
 */
export function renderMesh2DOnGPU(
  context: RenderContext,
  layer: Layer,
  texture: CanvasImageSource,
  positions: ArrayLike<number>,
): Mesh2DGPURenderResult {
  const mesh = layer.mesh2d, appearance = mesh?.appearance
  if (!mesh || appearance?.kind !== 'texture') return 'fallback-invalid'
  if (context.canvas.filter && context.canvas.filter !== 'none') return 'fallback-filter'
  if (typeof context.canvas.getTransform !== 'function') return 'fallback-unavailable'
  const dimensions = mesh2DTextureSourceDimensions(texture)
  if (!dimensions) return 'fallback-invalid'
  let placement
  try {
    placement = resolveMesh2DTexturePlacement(
      mesh.geometry, dimensions.width, dimensions.height, appearance.textureTransform,
    )
  } catch {
    return 'fallback-invalid'
  }
  if (!placement) return 'fallback-invalid'
  const converted = Mesh2DGPUVertexConverter.convert(
    mesh.geometry, positions, placement, dimensions.width, dimensions.height,
  )
  if (!converted) return 'fallback-invalid'
  const gpu = getBackend()
  if (!gpu || gpu.contextLost) return 'fallback-unavailable'
  const matrix = context.canvas.getTransform()
  const fillOpacity = getLayerValue(context.overrides, layer.id, 'style.fill.opacity', layer.style?.fill?.opacity ?? 100)
  const rendered = gpu.draw({
    ...converted,
    texture,
    sourceWidth: dimensions.width,
    sourceHeight: dimensions.height,
    sampling: appearance.sampling,
    backingWidth: context.canvas.canvas.width,
    backingHeight: context.canvas.canvas.height,
    localToBacking: { a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d, e: matrix.e, f: matrix.f },
    alpha: context.canvas.globalAlpha * Math.max(0, Math.min(100, fillOpacity)) / 100,
  })
  if (!rendered) return 'fallback-unavailable'
  Mesh2DGPUCompositor.composite(gpu.canvas, context.canvas)
  return 'rendered'
}

function getBackend(): Mesh2DGPUBackend | null {
  if (attempted) return backend
  attempted = true
  const capabilities = gpuCapabilities.getReport()
  if (capabilities.tier === 'none') return null
  try { backend = new WebGLMesh2DBackend(capabilities) }
  catch { backend = null }
  return backend
}
