import type { ChronoScene, Transform } from '../../types'
import { Matrix2D } from '../../geometry/Matrix2D'
import { LayerIndex } from '../../scene/LayerIndex'

/** Shared Explorer script/UI guard for a constant source-to-parent transform.
 * Transform tracks (even empty/controller tracks), path constraints and bound
 * transform inputs require an explicit bake or script keepWorld:false. Does
 * not reject a descendant's animation when its root world matrix stays fixed.
 * Pure validation; errors publish no command or source mutation.
 */
export function assertStaticTransform(scene: ChronoScene, ids: readonly string[]): void {
  const index = new LayerIndex(scene.layers)
  for (const id of ids) {
    const layer = index.get(id)
    if (!layer) throw new Error(`Layer '${id}' was not found.`)
    if (layer.followPath || layer.motionPath || Object.keys(layer.paramBindings ?? {}).some(path => path.startsWith('transform.'))
      || scene.bindings.some(binding => binding.target.type === 'layerProperty' && binding.target.layerId === id && binding.target.property?.startsWith('transform.'))
      || scene.parameterWires?.some(wire => wire.enabled && wire.target.layerId === id && wire.target.propertyPath.startsWith('transform.'))
      || scene.timelines.some(timeline => timeline.tracks.some(track => track.target.startsWith(`layers.${id}.transform.`)))) {
      throw new Error('Preserving world placement for animated transforms requires baking first; use keepWorld:false for an intentional local-space move.')
    }
  }
}
/** Convert a 2D affine matrix to the existing anchored TRS source contract.
 * Position is composition/parent-local px and rotation degrees. Preserves
 * anchors and unrelated transform fields. Rejects nonfinite/singular matrices
 * (det < 1e-9) and shear (linear reconstruction residual > 1e-6), rather than
 * approximating artwork. Reuses Matrix2D decomposition; caller owns output.
 */
export function localTransform(matrix: Matrix2D, previous: Transform): Transform {
  if (matrix.toArray().some(value => !Number.isFinite(value))) throw new Error('Cannot preserve a non-finite transform.')
  const d = matrix.decompose()
  if (Math.abs(matrix.determinant()) < 1e-9) throw new Error('Cannot preserve a singular transform.')
  const reconstructed = Matrix2D.rotation(d.rotation).scale(d.scaleX, d.scaleY)
  if (Math.max(Math.abs(matrix.a - reconstructed.a), Math.abs(matrix.b - reconstructed.b), Math.abs(matrix.c - reconstructed.c), Math.abs(matrix.d - reconstructed.d)) > 1e-6) {
    throw new Error('This hierarchy change requires shear, which a layer transform cannot represent. Use keepWorld:false or bake the geometry first.')
  }
  // Canvas transform = T(x+anchor) R S T(-anchor).
  const anchor = reconstructed.applyToVector({ x: previous.anchorX, y: previous.anchorY })
  return { ...previous, x: matrix.e - previous.anchorX + anchor.x, y: matrix.f - previous.anchorY + anchor.y,
    rotationDeg: d.rotation, scaleX: d.scaleX, scaleY: d.scaleY }
}
