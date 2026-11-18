import { computeMesh2DLocalBounds } from '@/lib/geometry/mesh2d'
import type { LayerRendererPlugin } from '@/lib/registry/LayerRendererRegistry'
import type { Layer } from '@/lib/types'
import type { RenderContext } from '../RenderContext'
import { isMesh2DPinSelectionCurrent } from '@/lib/mesh2d'
import { drawMesh2DLayer, drawMesh2DPins, drawMesh2DWireframe } from '../mesh2dRenderer'

/** Canvas2D adapter for portable fixed-topology Mesh2D layers. */
export const mesh2DRendererPlugin: LayerRendererPlugin = {
  id: 'mesh2d',
  mediaDependencies: layer => ({
    assetIds: layer.mesh2d?.appearance?.kind === 'texture' && layer.mesh2d.appearance.textureAssetId
      ? [layer.mesh2d.appearance.textureAssetId]
      : [],
  }),
  paint: {
    alphaSafe: true,
    regionSafe: true,
    staticRasterSafe: true,
    localBounds: layer => layer.mesh2d ? computeMesh2DLocalBounds(layer.mesh2d.geometry) : null,
  },
  supports: (layer: Layer) => layer.type === 'mesh2d' && !!layer.mesh2d,
  render(ctx: RenderContext, layer: Layer): void {
    const assetId = layer.mesh2d?.appearance?.kind === 'texture'
      ? layer.mesh2d.appearance.textureAssetId
      : undefined
    drawMesh2DLayer(ctx.canvas, layer, ctx.overrides, assetId ? ctx.assets.get(assetId) : undefined)
  },
  renderEditorOverlay(ctx: RenderContext, layer: Layer, preferences): void {
    if (preferences.meshTriangles && layer.mesh2d) {
      drawMesh2DWireframe(ctx.canvas, layer.mesh2d.geometry, ctx.displayScale)
    }
    if (layer.mesh2d?.pins?.vertexIds.length) {
      drawMesh2DPins(
        ctx.canvas,
        layer.mesh2d.geometry,
        layer.mesh2d.pins.vertexIds,
        ctx.displayScale,
        !isMesh2DPinSelectionCurrent(layer),
      )
    }
  },
}
