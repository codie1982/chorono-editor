import type { Model3DData, Model3DResource } from '../types'
import type { ModelResourceLookup } from '../inspection/types'
import { modelMeasurement } from '../measurement/modelMeasurement'

/** True only for the explicit empty-scene asset while its authored 3D world
 * still has no primitives or secondary models. An empty imported asset is not
 * silently recast as an editable empty scene. */
export function isEmptyModelScene(data: Model3DData, resource: Model3DResource): boolean {
  return resource.isExplicitEmptyScene === true
    && (data.modeling?.objects.length ?? 0) === 0
    && (!data.content || Object.keys(data.content.instances).length === 1)
}

/** Paint an editor-only viewport card in layer-local 2D coordinates. The grid
 * is the actual camera-relative 3D inspection grid; the dark backdrop and
 * caption make the otherwise transparent empty source readable on a light
 * composition. The caller owns the borrowed resource and canvas context. */
export function drawEmptyModelScenePreview(ctx: CanvasRenderingContext2D, data: Model3DData, resource: Model3DResource,
  width: number, height: number, lookup?: ModelResourceLookup): void {
  ctx.save()
  try {
    ctx.fillStyle = '#111827'
    ctx.fillRect(0, 0, width, height)
    resource.draw(ctx, data, width, height, lookup, {
      camera: { ...data.camera, projection: data.content?.view.projection ?? 'perspective', orthoHeight: data.content?.view.orthoHeight ?? 2.8 },
      showGrid: true, grid: modelMeasurement(data),
    })
    if (width >= 180 && height >= 62) {
      ctx.fillStyle = 'rgba(15, 23, 42, .88)'
      ctx.fillRect(10, 10, 148, 42)
      ctx.fillStyle = '#e2e8f0'
      ctx.font = '600 13px system-ui, sans-serif'
      ctx.fillText('EMPTY 3D SCENE', 18, 29)
      ctx.font = '11px system-ui, sans-serif'
      ctx.fillStyle = '#94a3b8'
      ctx.fillText('Double-click to edit', 18, 44)
    }
  } finally { ctx.restore() }
}
