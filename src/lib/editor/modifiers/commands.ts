import type { ChronoScene, Layer } from '../../types'
import type { EditorCommand } from '../commands-keyframe'
import type { ModifierGeometry, ModifierRecord, GeometryModifierStackData } from '../../modifiers'
import { geometryModifierRegistry, modifierStackService } from '../../modifiers'
import { splineTopologySignature } from '../../modifiers/spline/identity'
import { meshModifierRestIdentity } from '../../modifiers/mesh/restIdentity'
import { uid } from '../../spline/util/uid'
import { assertLayerAncestors } from '../../scene/hierarchy/assertLayerAncestors'

import { modifierGeometryDriverReason } from '../../modifiers/sourcePolicy'
/** Static geometry authority. Transform/paint playback remains supported;
 * source/topology drivers cannot be silently captured at one evaluated pose. */
function editable(scene: ChronoScene, id: string): Layer {
  const layer = scene.layers.find(item => item.id === id)
  if (!layer || layer.locked || layer.frozen || layer.hidden || layer.instanceOf || layer.booleanResultFor || layer.booleanOperation)
    throw new Error('Select an unlocked independent geometry source.')
  assertLayerAncestors(scene, layer)
  const reason = modifierGeometryDriverReason(scene, layer)
  if (reason) throw new Error(reason)
  return layer
}

/** CAS command over a complete recomputed result. Undo restores the exact base,
 * stack order/settings, result and unrelated source. No preview mutates history. */
function replace(scene: ChronoScene, layer: Layer, stack: GeometryModifierStackData | null, label: string): EditorCommand {
  const result = stack ? modifierStackService.execute(layer, stack) : { ...modifierStackService.execute(layer, modifierStackService.stackFor(layer)), modifierStack: undefined, geometryConversion: undefined }
  const candidate = { ...scene, layers: scene.layers.map(item => item.id === layer.id ? result : item) }
  return { label, execute(current) {
    if (current !== scene) throw new Error('Scene changed while editing modifiers. Apply again from the current source.')
    editable(current, layer.id)
    return candidate
  }, undo: () => scene }
}

/** Add a real, persisted instance. Valid defaults enable immediately. When the
 * solver rejects a default (e.g. no sharp corners), add it explicitly disabled
 * so its settings can be configured without admitting an invalid result. */
export function prepareAddModifier(scene: ChronoScene, layerId: string, type: string,
  selection?: { pointIds?: readonly string[]; contourIds?: readonly string[] }) {
  const layer = editable(scene, layerId), stack = modifierStackService.stackFor(layer)
  const input = modifierStackService.evaluator.execute(stack, { layerId })
  const definition = geometryModifierRegistry.get(type).descriptor
  if (!definition.addable || !definition.inputs.includes(input.kind)) throw new Error(`${definition.label} is not available for ${input.kind}.`)
  let id: string
  do { id = uid('modifier') } while (stack.modifiers.some(item => item.id === id))
  let record = geometryModifierRegistry.newRecord(type, id, input)
  if (input.kind === 'spline' && selection) {
    const field = definition.fields.find(item => item.kind === 'points' || item.kind === 'contours')
    const ids = field?.kind === 'points' ? selection.pointIds : selection.contourIds
    if (field && ids?.length) record = { ...record, settings: { ...record.settings, [field.key]: [...ids], selectionTopology: splineTopologySignature(input.spline) } }
  }
  let candidate = { ...stack, modifiers: [...stack.modifiers, record] }, warning: string | undefined
  try { modifierStackService.execute(layer, candidate) } catch (error) {
    warning = `Added disabled: ${error instanceof Error ? error.message : String(error)}`
    record = { ...record, enabled: false }; candidate = { ...stack, modifiers: [...stack.modifiers, record] }
  }
  return { modifierId: id, warning, command: replace(scene, layer, candidate, `Add ${definition.label} modifier`) }
}

/** Update one instance's own settings, never a derived result geometry. Explicit
 * targets capture topology identity so reordered upstream stages cannot rebind
 * the same IDs to different corners. Asset existence is checked when chosen. */
export function makeSetModifierSettingsCmd(scene: ChronoScene, layerId: string, modifierId: string, patch: Readonly<Record<string, unknown>>): EditorCommand {
  return makeExecuteModifierStackCmd(scene, layerId, { [modifierId]: patch })
}

/** Stage all supplied settings, execute the complete ordered pipeline and
 * commit only its final validated output in one undo command. Pending UI edits
 * never alter object geometry. A failing stage leaves both scene and history
 * untouched. Prefix execution supplies each instance's actual input contract. */
export function makeExecuteModifierStackCmd(scene: ChronoScene, layerId: string,
  patches: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {}): EditorCommand {
  const layer = editable(scene, layerId), stack = modifierStackService.stackFor(layer)
  for (const id of Object.keys(patches)) if (!stack.modifiers.some(item => item.id === id)) throw new Error('Modifier no longer exists.')
  const modifiers = [...stack.modifiers]
  for (let index = 0; index < modifiers.length; index++) {
    const before = modifiers[index], patch = patches[before.id]
    if (!patch) continue
    const input = modifierStackService.evaluator.execute({ ...stack, modifiers }, { layerId }, index)
    modifiers[index] = { ...before, settings: stageSettings(scene, before, input, patch) }
  }
  return replace(scene, layer, { ...stack, modifiers }, 'Execute modifier stack')
}

/** Instance-owned schema validation happens in its class. This integration
 * adapter admits scene asset references and captures explicit topology targets. */
function stageSettings(scene: ChronoScene, before: ModifierRecord, input: ModifierGeometry,
  patch: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const settings: Record<string, unknown> = { ...before.settings, ...structuredClone(patch) }
  if (input.kind === 'spline' && ('pointIds' in patch || 'contourIds' in patch)) {
    const ids = patch.pointIds ?? patch.contourIds
    const records = 'pointIds' in patch ? input.spline.points : input.spline.contours
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !(id in records))) throw new Error('Select existing elements in this modifier’s input.')
    settings.selectionTopology = ids.length ? splineTopologySignature(input.spline) : undefined
  }
  if (typeof patch.assetId === 'string' && patch.assetId) {
    const field = geometryModifierRegistry.get(before.type).descriptor.fields.find(item => item.kind === 'asset')
    if (field && !scene.assets.some(asset => asset.id === patch.assetId && asset.type === field.assetType)) throw new Error('Choose an existing compatible deformation asset.')
    if (input.kind === 'mesh2d') { settings.topologyHash = input.mesh.geometry.topology.topologyHash; settings.restIdentity = meshModifierRestIdentity(input.mesh.geometry) }
  }
  return settings
}

/** Toggle by stable instance ID. Incompatible conversion/deformation order
 * refuses atomically; disabled stages do not change the geometry type. */
export function makeToggleModifierCmd(scene: ChronoScene, layerId: string, id: string, enabled: boolean): EditorCommand {
  const layer = editable(scene, layerId), stack = modifierStackService.stackFor(layer)
  if (!stack.modifiers.some(item => item.id === id)) throw new Error('Modifier no longer exists.')
  return replace(scene, layer, { ...stack, modifiers: stack.modifiers.map(item => item.id === id ? { ...item, enabled } : item) }, enabled ? 'Enable modifier' : 'Disable modifier')
}
/** Remove any dependency-compatible stage, not only the final list row. */
export function makeRemoveModifierCmd(scene: ChronoScene, layerId: string, id: string): EditorCommand {
  const layer = editable(scene, layerId), stack = modifierStackService.stackFor(layer)
  if (!stack.modifiers.some(item => item.id === id)) throw new Error('Modifier no longer exists.')
  return replace(scene, layer, { ...stack, modifiers: stack.modifiers.filter(item => item.id !== id) }, 'Remove modifier')
}
/** Ordered move uses the same evaluator as settings/render/output. No silent
 * source-type adaptation or automatic target remapping is performed. */
export function makeMoveModifierCmd(scene: ChronoScene, layerId: string, id: string, direction: -1 | 1): EditorCommand {
  const layer = editable(scene, layerId), stack = modifierStackService.stackFor(layer)
  const index = stack.modifiers.findIndex(item => item.id === id), next = index + direction
  if (index < 0 || next < 0 || next >= stack.modifiers.length) throw new Error('Modifier cannot move past the stack boundary.')
  const modifiers = [...stack.modifiers]; [modifiers[index], modifiers[next]] = [modifiers[next], modifiers[index]]
  return replace(scene, layer, { ...stack, modifiers }, 'Reorder modifiers')
}
/** Explicitly collapse a validated stack to ordinary editable geometry. */
export function makeBakeModifierStackCmd(scene: ChronoScene, layerId: string): EditorCommand {
  return replace(scene, editable(scene, layerId), null, 'Bake modifier stack')
}
/** Source editing/rebuild recomputes downstream from the new base. Resetting
 * converted point overrides is explicit; ordinary parameter edits never guess. */
export function makeSetModifierSourceCmd(scene: ChronoScene, layerId: string, source: ModifierGeometry, resetConvertedEdits = false): EditorCommand {
  const layer = editable(scene, layerId), stack = modifierStackService.stackFor(layer)
  const modifiers: readonly ModifierRecord[] = resetConvertedEdits ? stack.modifiers.map(item => {
    if (item.type !== 'convertSpline') return item
    const { edited: _edited, ...settings } = item.settings; return { ...item, settings }
  }) : stack.modifiers
  return replace(scene, layer, { ...stack, source: structuredClone(source), modifiers }, 'Update modifier source')
}

/** Convert through the registry without discarding existing modifiers. Shape →
 * Mesh adds the necessary Spline representation stage in memory/the same stack,
 * never a second scene object. Existing serializable source remains canonical. */
export function prepareConvertModifierStack(scene: ChronoScene, layerId: string, target: 'spline' | 'mesh2d') {
  const layer = editable(scene, layerId), stack = modifierStackService.stackFor(layer)
  let geometry = modifierStackService.evaluator.execute(stack, { layerId })
  const modifiers = [...stack.modifiers], taken = new Set(modifiers.map(item => item.id))
  const append = (type: string) => {
    let id: string
    do { id = uid('modifier') } while (taken.has(id))
    taken.add(id)
    const record = geometryModifierRegistry.newRecord(type, id, geometry)
    geometry = geometryModifierRegistry.create(record).execute(geometry, { layerId }); modifiers.push(record)
  }
  if (target === 'mesh2d') {
    if (geometry.kind === 'shape') append('convertSpline')
    if (geometry.kind !== 'spline') throw new Error('This object is already a 2D Mesh.')
    append('convertMesh2d')
  } else append('convertSpline')
  return { layerId, command: replace(scene, layer, { ...stack, modifiers }, `Convert to ${target === 'spline' ? 'Spline' : '2D Mesh'}`) }
}
