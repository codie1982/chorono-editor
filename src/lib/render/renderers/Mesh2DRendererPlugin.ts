import { computeMesh2DLocalBounds } from '@/lib/geometry/mesh2d'
import type { LayerRendererPlugin } from '@/lib/registry/LayerRendererRegistry'
import type { Layer } from '@/lib/types'
import type { RenderContext } from '../RenderContext'
import { isMesh2DPinSelectionCurrent, resolveMesh2DDeformation } from '@/lib/mesh2d'
import { drawMesh2DLayer, drawMesh2DPins, drawMesh2DWireframe } from '../mesh2dRenderer'
import { renderMesh2DOnGPU } from '../gpu/mesh2d/Mesh2DGPUDispatch'
import { drawMesh2DBoundaryStroke } from '../mesh2dBoundaryStroke'
import { imagePaint, imagePaintAssetIds } from '../../paint/paintSource'

/** Canvas2D adapter for portable fixed-topology Mesh2D layers. */
export const mesh2DRendererPlugin: LayerRendererPlugin = {
  id: 'mesh2d',
  mediaDependencies: layer => ({
    assetIds: [
      ...imagePaintAssetIds(layer.style?.fill),
      ...(layer.mesh2d?.appearance?.kind === 'texture' && layer.mesh2d.appearance.textureAssetId
        ? [layer.mesh2d.appearance.textureAssetId]
        : []),
      ...(layer.mesh2d?.deformation?.assetId ? [layer.mesh2d.deformation.assetId] : []),
    ],
  }),
  paint: {
    alphaSafe: true,
    regionSafe: true,
    staticRasterSafe: layer => !imagePaint(layer.style?.fill),
    // A deformation frame is asset/time dependent while this conservative
    // paint contract is not. Opt out instead of culling against rest bounds.
    localBounds: layer => layer.mesh2d && !layer.mesh2d.deformation && !layer.style?.stroke
      ? computeMesh2DLocalBounds(layer.mesh2d.geometry) : null,
  },
  supports: (layer: Layer) => layer.type === 'mesh2d' && !!layer.mesh2d,
  render(ctx: RenderContext, layer: Layer): void {
    const assetId = layer.mesh2d?.appearance?.kind === 'texture'
      ? layer.mesh2d.appearance.textureAssetId
      : undefined
    const deformationAssetId = layer.mesh2d?.deformation?.assetId
    const deformation = resolveMesh2DDeformation(
      layer,
      deformationAssetId ? ctx.assets.meshDeformations?.get(deformationAssetId) : undefined,
      ctx.timeMs,
    )
    const texture = assetId ? ctx.assets.get(assetId) : undefined
    if (!texture || renderMesh2DOnGPU(ctx, layer, texture, deformation.positions ?? layer.mesh2d?.geometry.positions ?? []) !== 'rendered') {
      drawMesh2DLayer(ctx.canvas, layer, ctx.overrides, texture, deformation.positions, ctx.assets, ctx.paramValues)
    }
    drawMesh2DBoundaryStroke(ctx.canvas, layer, ctx.overrides, deformation.positions ?? layer.mesh2d?.geometry.positions ?? [])
  },
  renderEditorOverlay(ctx: RenderContext, layer: Layer, preferences): void {
    const deformationAssetId = layer.mesh2d?.deformation?.assetId
    const deformation = resolveMesh2DDeformation(
      layer,
      deformationAssetId ? ctx.assets.meshDeformations?.get(deformationAssetId) : undefined,
      ctx.timeMs,
    )
    if (preferences.meshTriangles && layer.mesh2d) {
      drawMesh2DWireframe(ctx.canvas, layer.mesh2d.geometry, ctx.displayScale, deformation.positions)
    }
    if (layer.mesh2d?.pins?.vertexIds.length) {
      drawMesh2DPins(
        ctx.canvas,
        layer.mesh2d.geometry,
        layer.mesh2d.pins.vertexIds,
        ctx.displayScale,
        !isMesh2DPinSelectionCurrent(layer),
        deformation.positions,
      )
    }
  },
}
