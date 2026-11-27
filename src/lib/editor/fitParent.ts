import type { ChronoScene } from '../types'
import type { OverrideMap } from '../evaluator'
import { Matrix2D } from '../geometry/Matrix2D'
import { createLayerWorldBoundsResolver } from '../geometry/resolveLayerWorldBounds'
import { prepareTransformTargets, applyWorldTransform } from '../canvas/math/preparedTransforms'
import { sourceTransformChange } from '../canvas/math/sourceTransformChange'
import { makeUpdateLayerCmd } from './commands-layer'
import { makeBatchCmd } from './commands-batch'
import { buildViewportKeyframeCommands, type ViewportKeyframeOptions, type ViewportLayerChange } from './viewportKeyframes'
import type { EditorCommand } from './commands-keyframe'

/** Stretch independent selected roots to their own parent's geometry frame;
 * unparented roots use the composition rectangle. Bounds are measured in each
 * parent's evaluated local axes, excluding stroke/effect padding. Groups use
 * their pre-edit child union, avoiding incremental/order-dependent fitting.
 *
 * Reuses viewport TRS decomposition, source-channel diff and animation policy.
 * Anchors, children, geometry, asset data and unrelated animation remain intact.
 * Intended animated channels follow the normal manual/auto-key rules; the layer
 * edits and keys form one Undo. No source is mutated during preparation.
 * Missing/degenerate bounds, locks, drivers, singular transforms or affine shear
 * unsupported by Chorono's TRS fail atomically; no approximate pose is written.
 */
export function buildFitParentCommand(scene: ChronoScene, ids: ReadonlySet<string> | readonly string[],
  options: ViewportKeyframeOptions & { overrides?: OverrideMap }): EditorCommand | null {
  if (!Array.from(ids).length) return null
  const prepared = prepareTransformTargets(scene, new Set(ids), options.timeMs, options.overrides)
  if (!prepared.ok) throw new Error(prepared.reason)
  const changes: ViewportLayerChange[] = []
  for (const target of prepared.targets) {
    const bounds = createLayerWorldBoundsResolver(scene, options.timeMs, options.overrides, { worldToSpace: target.worldToParent })
    const source = bounds(target.originalLayer)
    const parent = scene.layers.find(layer => layer.id === target.originalLayer.parentId)
    const destination = parent ? bounds(parent) : { x: 0, y: 0, width: scene.composition.width, height: scene.composition.height }
    if (!source || !destination || [source.width, source.height, destination.width, destination.height].some(n => !Number.isFinite(n) || n < 1e-6)) {
      throw new Error('Fit Parent requires non-empty object and parent bounds.')
    }
    const local = Matrix2D.translation(destination.x, destination.y)
      .scale(destination.width / source.width, destination.height / source.height).translate(-source.x, -source.y)
    const result = applyWorldTransform([target], target.parentWorld.multiply(local).multiply(target.worldToParent))
    if (!result.ok) throw new Error(result.reason)
    const change = sourceTransformChange(target, result.changes[0].transform)
    if (change) changes.push(change)
  }
  if (!changes.length) return null
  return makeBatchCmd('Fit Parent', [...changes.map(change => makeUpdateLayerCmd(change.prev.id, change.next, change.prev)),
    ...buildViewportKeyframeCommands(scene, changes, options)])
}
