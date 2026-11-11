import { evaluateSceneFrame } from '@/lib/runtime/evaluateSceneFrame'
import type { ChronoScene, Layer } from '../types'
import { Matrix2D } from '../geometry/Matrix2D'
import { createLayerWorldMatrixResolver } from '../geometry/resolveLayerWorldMatrix'
import { prepareTransformTargets } from '../canvas/math/preparedTransforms'
import { LayerIndex } from '../scene/LayerIndex'
import { materializeLayerOverrides } from '../render/materializeOverrides'
import { transformBezierPath } from '../path/transformBezierPath'
import { resolveArrayTransforms } from './ArrayTransformResolver'
import type { ArrayForestOptions } from './ArrayForestTypes'
import type { CloneOccurrencePlacement, CloneRootPlacement } from '../clone/CloneForestTypes'

/** Evaluate selection roots once at authoring composition time. A single shared
 * operation is applied to every root, preserving the forest's arrangement.
 * World/parent/local mean the primary root's reference axes at this pinned time.
 * Later animation continues in its existing parent space; this is not a dynamic
 * world constraint that counteracts future parent motion. */
export function solveArrayForest(scene: ChronoScene, roots: readonly Layer[], options: ArrayForestOptions) {
  const index = new LayerIndex(scene.layers), rootIds = new Set(roots.map(root => root.id))
  let primary = index.get(options.primaryId ?? '')
  while (primary?.parentId && !rootIds.has(primary.id)) primary = index.get(primary.parentId)
  const prepared = prepareTransformTargets(scene, roots.map(root => root.id), options.timeMs,
    undefined, { activeId: primary?.id, pivotMode: options.pivotMode ?? 'selectionCenter' })
  if (!prepared.ok) throw new Error(prepared.reason)
  const active = prepared.targets.find(target => target.id === primary?.id) ?? prepared.targets[0]
  const spaceToWorld = options.settings.space === 'world' ? Matrix2D.identity()
    : options.settings.space === 'parent' ? active.parentWorld : active.worldMatrix
  const worldToSpace = spaceToWorld.invert(), pivot = prepared.pivot, pivotInSpace = worldToSpace.applyToPoint(pivot)
  const virtual: Layer = { ...active.originalLayer, transform: { x: pivotInSpace.x, y: pivotInSpace.y,
    anchorX: 0, anchorY: 0, rotationDeg: 0, scaleX: 1, scaleY: 1 }, opacity: 1 }
  let providers: Layer[] = []
  if (options.settings.pattern === 'path') {
    const source = index.get(options.settings.pathLayerId), frame = evaluateSceneFrame(scene, options.timeMs).overrides
    if (!source || source.type !== 'path' || !source.path) throw new Error('Choose an existing path layer with at least two anchors.')
    const materialized = materializeLayerOverrides(source, frame)
    const worldFor = createLayerWorldMatrixResolver(scene, options.timeMs, frame, index)
    providers = [{ ...materialized, transform: { ...virtual.transform, x: 0, y: 0 },
      path: transformBezierPath(materialized.path!, worldToSpace.multiply(worldFor(source))) }]
  }
  const transforms = resolveArrayTransforms(virtual, options.settings, providers)
  if (!transforms.length) throw new Error('The array has no valid occurrences. Check its count and path length.')
  const occurrences = transforms.filter(transform => !transform.isSourceIndex).map(transform => {
    const operation = Matrix2D.translation(transform.position.x, transform.position.y).rotate(transform.rotation)
      .scale(transform.scale.x, transform.scale.y).translate(-pivotInSpace.x, -pivotInSpace.y)
    const world = spaceToWorld.multiply(operation).multiply(worldToSpace)
    const placement: CloneOccurrencePlacement = { roots: Object.fromEntries(prepared.targets.map(target => {
      const parentLocal = target.worldToParent.multiply(world).multiply(target.parentWorld)
      return [target.id, decomposeArrayPlacement(parentLocal)]
    })), timeOffsetMs: transform.index * (options.settings.timeOffsetMs ?? 0) }
    return { index: transform.index, world, placement }
  })
  return { occurrences, reference: { pivotWorld: pivot, spaceToWorld, worldToSpace } }
}

/** The native layer TRS model cannot encode shear. Recompose and compare every
 * matrix component at relative1e-7 tolerance; reflections are preserved and
 * determinant below1e-9 is rejected. No lossy approximation is written. */
export function decomposeArrayPlacement(matrix: Matrix2D): CloneRootPlacement {
  if (!matrix.toArray().every(Number.isFinite) || Math.abs(matrix.determinant()) < 1e-9) throw new Error('Array placement has singular or non-finite scale.')
  const value = matrix.decompose(), rebuilt = Matrix2D.translation(value.x, value.y).rotate(value.rotation).scale(value.scaleX, value.scaleY)
  if (matrix.toArray().some((number, i) => Math.abs(number - rebuilt.toArray()[i]) > 1e-7 * Math.max(1, Math.abs(number)))) {
    throw new Error('This array transform introduces shear under the selected parent. Use a compatible parent/space or uniform scale.')
  }
  const near = (value: number, target: number) => Math.abs(value - target) < 1e-10 ? target : value
  return { x: near(value.x, 0), y: near(value.y, 0), rotationDeg: near(value.rotation, 0),
    scaleX: near(value.scaleX, 1), scaleY: near(value.scaleY, 1) }
}
