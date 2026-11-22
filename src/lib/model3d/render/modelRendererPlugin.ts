import { modelAssetIds } from '../content/modelContent'
import type { LayerRendererPlugin } from '../../registry/LayerRendererRegistry'
import { drawEmptyModelScenePreview, isEmptyModelScene } from './EmptyModelScenePreview'
/** Composite a prepared transparent 3D surface through the ordinary 2D paint
 * pipeline (affine, opacity, masks, effects and stacking). Preparation ownership
 * is the same media session used by viewport/final jobs. No lazy async work or
 * viewport LOD enters this plugin. Editor placeholders never count as output. */
export const modelRendererPlugin: LayerRendererPlugin = {
  id: 'model3d',
  supports: layer => layer.type === 'model3d',
  mediaDependencies: layer => ({ assetIds: modelAssetIds(layer.model3d) }),
  paint: { alphaSafe: true, regionSafe: true, localBounds: layer => layer.size ? { x: 0, y: 0, width: layer.size.width, height: layer.size.height } : null },
  render: (ctx, layer) => {
    const data = layer.model3d, size = layer.size
    const model = data && ctx.assets.modelForAsset?.(data.assetId)
    let renderError: string | undefined
    if (model && data && size) {
      try {
        if (ctx.renderMode === 'editor' && !ctx.assets.finalOutput && isEmptyModelScene(data, model))
          drawEmptyModelScenePreview(ctx.canvas, data, model, size.width, size.height, ctx.assets.modelForAsset)
        else model.draw(ctx.canvas, data, size.width, size.height, ctx.assets.modelForAsset)
        return
      }
      catch (error) { if (ctx.assets.finalOutput) throw error; renderError = error instanceof Error ? error.message : String(error) }
    }
    if (ctx.assets.finalOutput) throw new Error(`3D model '${layer.name}' is not prepared; use the media-frame output pipeline.`)
    ctx.canvas.fillStyle = '#334155'; ctx.canvas.fillRect(0, 0, size?.width ?? 400, size?.height ?? 400)
    ctx.canvas.fillStyle = '#e2e8f0'; ctx.canvas.font = '14px sans-serif'
    const error = renderError || (data && ctx.assets.media?.snapshot().errors[data.assetId])
    ctx.canvas.fillText(error ? '3D model unavailable — check import/resources' : data?.assetId ? 'Preparing 3D model…' : 'Import a GLB/glTF model', 12, 28)
  },
}
