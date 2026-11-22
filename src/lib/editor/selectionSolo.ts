import type { ChronoScene } from '../types'
import { LayerIndex } from '../scene/LayerIndex'
import { resolveSelectionRoots } from '../selection/selectionRoots'
import { makeBulkToggleFlagCmd } from './commands-layer'
import { makeBatchCmd } from './commands-batch'
import type { EditorCommand } from './commands-keyframe'

/** Solo exactly the selected independent roots, replacing earlier Solo roots in
 * the selected visual/audio domains. Groups inherit Solo to their descendants
 * through the shared visibility scope; descendants need no redundant flags.
 * Omitted enabled toggles an identical Solo selection off. Explicit enabled is
 * used by bulk controls. Unselected domains, hidden/time flags and source order
 * remain untouched. Missing IDs are ignored; empty/invalid hierarchies and
 * unchanged explicit requests return null. One batch preserves exact prior
 * flags for undo/redo; inputs and selection never mutate.
 */
export function makeSelectionSoloCmd(scene: ChronoScene, ids: Iterable<string>, enabled?: boolean): EditorCommand | null {
  const index = new LayerIndex(scene.layers)
  const existing = Array.from(ids).filter(id => index.get(id))
  const selection = resolveSelectionRoots(scene.layers, existing, index)
  if (!selection.ok || selection.roots.length === 0) return null
  const targets = new Set(selection.roots.map(layer => layer.id))
  const domains = new Set(selection.roots.map(layer => layer.type === 'audio'))
  const affected = scene.layers.filter(layer => domains.has(layer.type === 'audio'))
  const next = enabled ?? !affected.every(layer => !!layer.solo === targets.has(layer.id))
  const on = affected.filter(layer => next && targets.has(layer.id) && !layer.solo).map(layer => layer.id)
  const off = affected.filter(layer => layer.solo && (!next || !targets.has(layer.id))).map(layer => layer.id)
  const commands = []
  if (off.length) commands.push(makeBulkToggleFlagCmd(off, 'solo', false))
  if (on.length) commands.push(makeBulkToggleFlagCmd(on, 'solo', true))
  return commands.length ? makeBatchCmd(next ? 'Solo selection' : 'Clear selection Solo', commands) : null
}
