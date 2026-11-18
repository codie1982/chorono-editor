import { computeMesh2DLocalBounds } from '@/lib/geometry/mesh2d'
import type { LayerRendererPlugin } from '@/lib/registry/LayerRendererRegistry'
import type { Layer } from '@/lib/types'
import type { RenderContext } from '../RenderContext'
import { drawMesh2DLayer, drawMesh2DWireframe } from '../mesh2dRenderer'

/** Canvas2D adapter for portable fixed-topology Mesh2D layers. */
export const mesh2DRendererPlugin: LayerRendererPlugin = {
  id: 'mesh2d',
  nativeMediaFree: true,
  mediaDependencies: () => ({}),
  paint: {
    alphaSafe: true,
    regionSafe: true,
    staticRasterSafe: true,
    localBounds: layer => layer.mesh2d ? computeMesh2DLocalBounds(layer.mesh2d.geometry) : null,
  },
  supports: (layer: Layer) => layer.type === 'mesh2d' && !!layer.mesh2d,
  render(ctx: RenderContext, layer: Layer): void {
    drawMesh2DLayer(ctx.canvas, layer, ctx.overrides)
  },
  renderEditorOverlay(ctx: RenderContext, layer: Layer): void {
    if (layer.mesh2d) drawMesh2DWireframe(ctx.canvas, layer.mesh2d.geometry, ctx.displayScale)
  },
}
