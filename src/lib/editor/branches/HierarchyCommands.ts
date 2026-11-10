import type { ChronoScene } from '../../types'
import { LayerIndex } from '../../scene/LayerIndex'
import { Matrix2D } from '../../geometry/Matrix2D'
import { resolveLayerWorldMatrix } from '../../geometry/resolveLayerWorldMatrix'
import type { EditorCommand } from '../commands-keyframe'
import { makeMoveLayerToCmdWithSnapshot } from '../commands-layer'
import { makeGroupCmd, type GroupCmdResult } from '../commands-group'
import { assertStaticTransform, localTransform } from './WorldPlacement'

/** Reject malformed source chains and inherited/subtree protection before
 * changing hierarchy. Does not silently repair or bypass source flags. */
function editableChain(index: LayerIndex, id: string, subtree: boolean): Set<string> {
  const chain = new Set<string>()
  let current: string | undefined = id
  while (current) {
    const layer = index.get(current)
    if (!layer) throw new Error(`Layer '${current}' was not found.`)
    if (chain.has(current)) throw new Error('Cannot edit a cyclic hierarchy.')
    chain.add(current); current = layer.parentId
  }
  const editable = subtree ? new Set([...Array.from(chain), ...Array.from(index.subtreeIds([id]))]) : chain
  for (const target of Array.from(editable)) {
    const layer = index.get(target)!
    if (layer.locked || layer.frozen) throw new Error(`Unlock and unfreeze '${layer.name}' before editing its hierarchy.`)
  }
  return chain
}

/** Native UI move with exact anchored world placement. A same-parent reorder
 * needs no transform conversion. Reparenting requires static source/old/new
 * ancestor transforms and a group destination; descendant animations remain
 * untouched. Rejects protected/cyclic/missing/singular/sheared hierarchies.
 * toIndex is the absolute serialized layer index, as in the existing command.
 * No source is mutated during preparation. The command rejects stale source
 * snapshots, uses one normal history step, and exact undo restores the layer.
 * Existing low-level local-space/script APIs retain their public contracts.
 */
export function makeMoveLayerInTreeCmd(scene: ChronoScene, id: string, parentId: string | undefined, toIndex: number): EditorCommand | null {
  if (!Number.isInteger(toIndex)) throw new Error('Layer insertion index must be an integer.')
  const index = new LayerIndex(scene.layers), chain = editableChain(index, id, true), layer = index.get(id)!
  const native = makeMoveLayerToCmdWithSnapshot(scene, id, parentId, toIndex)!
  let transform = layer.transform
  if (layer.parentId !== parentId) {
    const parentChain = parentId ? editableChain(index, parentId, false) : new Set<string>()
    if (parentId && index.get(parentId)?.type !== 'group') throw new Error('A parent must be a group.')
    if (parentChain.has(id)) throw new Error('Reparent would create a cycle.')
    assertStaticTransform(scene, Array.from(new Set([...Array.from(chain), ...Array.from(parentChain)])))
    const world = resolveLayerWorldMatrix(layer, scene, 0, undefined, index)
    const parentWorld = parentId ? resolveLayerWorldMatrix(index.get(parentId)!, scene, 0, undefined, index) : Matrix2D.identity()
    transform = localTransform(parentWorld.invert().multiply(world), layer.transform)
  }
  const moved = native.execute(scene)
  if (layer.parentId === parentId && moved.layers.every((item, i) => item.id === scene.layers[i].id)) return null
  const next = { ...moved, layers: moved.layers.map(item => item.id === id ? { ...item, transform } : item) }
  return { label: 'Move layer in hierarchy', execute: current => {
    if (current.layers !== scene.layers || current.timelines !== scene.timelines) throw new Error('Hierarchy changed; repeat the move from current source.')
    return { ...current, layers: next.layers }
  }, undo: native.undo }
}

/** Identity-group only sibling selection. Normalizes overlapping parent/child
 * roots, rejects mixed parents/protected branches and reuses the native group
 * command. Animated children keep identical local transforms and tracks.
 * Multi-parent grouping needs an explicit conversion/bake and is not guessed.
 */
export function makeGroupSiblingLayersCmd(scene: ChronoScene, ids: readonly string[]): GroupCmdResult | null {
  const index = new LayerIndex(scene.layers), selected = new Set(ids)
  const roots = scene.layers.filter(layer => selected.has(layer.id) &&
    !Array.from(index.ancestorIds([layer.id], false)).some(ancestor => selected.has(ancestor)))
  if (!roots.length) return null
  roots.forEach(layer => editableChain(index, layer.id, true))
  if (roots.some(layer => layer.parentId !== roots[0].parentId)) throw new Error('Group requires sibling layers with a common parent.')
  return makeGroupCmd(roots.map(layer => layer.id))
}
