import type { ChronoScene, Layer } from '../../types'
import type { EditorCommand } from '../../editor/commands-keyframe'
import { makeUpdateLayerCmd } from '../../editor/commands-layer'
import { hasNativeExpressionOwner } from '../../editor/inputExpressions/ExpressionAuthoringGuard'
import { drivenChannelReason } from '../../timeline/authoring/keyableChannels'
import { propertyPathsOverlap } from '../../scene/properties/propertyPathsOverlap'
import { INSTANCE_SOURCE_FIELDS } from '../../clone/InstanceResolver'
import { assertSafeScriptData, mergeScriptData, type DeepPartial } from '../api/scriptData'
import { assertSplineLocks, assertSplineTopology } from '../api/splineHandleData'
import { changedScriptPaths, sameScriptValue } from './ScriptDataChanges'
import { assertScript2DPath } from './Script2DScope'
import { assertScriptLayerValues } from './ScriptLayerValues'

/** Validate inherited edit locks against the original hierarchy. Explicit
 * flag-only unlock is allowed; combining unlock and geometry edits is refused. */
function assertEditable(scene: ChronoScene, layer: Layer, paths: string[]): void {
  if (paths.every(path => path === 'locked' || path === 'frozen')) return
  const seen = new Set<string>()
  let current: Layer | undefined = layer
  while (current) {
    if (seen.has(current.id)) throw new Error('Invalid cyclic layer parent relationship.')
    seen.add(current.id)
    if (current.locked || current.frozen) throw new Error(`Layer '${current.id}' is locked or frozen.`)
    const parent: string | undefined = current.parentId
    current = parent ? scene.layers.find(item => item.id === parent) : undefined
    if (parent && !current) throw new Error(`Missing parent '${parent}'.`)
  }
}

/** Preserve native animation and driver ownership across all timelines, including
 * muted/other timelines. Sibling edits and exact no-ops remain legal. Recipes
 * cannot be removed through raw replacement to bypass a driven-field guard. */
function assertPatch(scene: ChronoScene, before: Layer, after: Layer): void {
  const paths = changedScriptPaths(before, after)
  assertEditable(scene, before, paths)
  for (const path of paths) {
    assertScript2DPath(path)
    if (['id','type','mode','instanceOf','booleanOperation','booleanRecipe','booleanSource'].some(key => propertyPathsOverlap(path, key))) throw new Error(`Cannot change layer identity or owned content: ${path}.`)
    if (before.instanceOf && INSTANCE_SOURCE_FIELDS.some(key => propertyPathsOverlap(path, key))) throw new Error('Edit the instance source explicitly; inherited visual fields are read-only.')
    if (/^(?:propertyExpressions|inputExpressions|paramBindings)(?:\.|$)/.test(path)) continue
    if (hasNativeExpressionOwner(scene, before.id, path)) throw new Error(`Animated field '${path}' cannot be overwritten; edit its keys instead.`)
    const target = `layers.${before.id}.${path}`
    const tracks = scene.timelines.flatMap(timeline => timeline.tracks).filter(track => propertyPathsOverlap(track.target, target))
    const reason = drivenChannelReason(scene, before, path) ?? tracks.map(track => drivenChannelReason(scene, before, path, track)).find(Boolean)
    if (reason) throw new Error(`${path}: ${reason}`)
    if (Object.keys(before.inputExpressions?.fields ?? {}).some(field => propertyPathsOverlap(field, path))) throw new Error(`A saved input expression owns '${path}'.`)
  }
  for (const family of ['propertyExpressions','inputExpressions','paramBindings'] as const) {
    const old = family === 'paramBindings' ? before[family] : before[family]?.fields
    const next = family === 'paramBindings' ? after[family] : after[family]?.fields
    for (const [path, value] of Object.entries(old ?? {})) if (!sameScriptValue(value, next?.[path])) throw new Error(`Existing ${family} '${path}' must be edited through its owning workflow.`)
    for (const path of Object.keys(next ?? {})) if (!Object.prototype.hasOwnProperty.call(old ?? {}, path)
      && (hasNativeExpressionOwner(scene, before.id, path) || drivenChannelReason(scene, before, path)
        || Object.keys(before.inputExpressions?.fields ?? {}).some(field => propertyPathsOverlap(field, path)))) throw new Error(`A native animation, formula or driver already owns '${path}'.`)
  }
  if (!sameScriptValue(before.parentId, after.parentId) && after.parentId) {
    const parent = scene.layers.find(item => item.id === after.parentId)
    if (!parent || parent.type !== 'group') throw new Error('Parent must be an existing group.')
    assertEditable({ ...scene, layers: scene.layers.map(item => item.id === before.id ? after : item) }, after, ['parentId'])
  }
  if (before.spline && !sameScriptValue(before.spline, after.spline)) {
    if (!after.spline) throw new Error('Spline geometry is required.')
    assertSplineTopology(after.spline); assertSplineLocks(before.spline, after.spline)
  }
  assertScriptLayerValues(before, after, scene)
}

/** Build an owned, stale-checked raw layer edit. set keeps shallow replacement;
 * patch recursively merges records and replaces arrays. Arguments are detached,
 * validation runs before dispatch and again at execution, and undo restores the
 * exact layer snapshot. No scene/key/ledger mutation occurs on refusal. */
export function makeScriptPatchCommand(scene: ChronoScene, layerId: string, patch: Partial<Layer> | DeepPartial<Layer>, deep = false): EditorCommand {
  assertSafeScriptData(patch)
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Layer patch must be a plain record.')
  const before = scene.layers.find(layer => layer.id === layerId)
  if (!before) throw new Error(`Layer '${layerId}' no longer exists.`)
  const owned = structuredClone(patch)
  const after = deep ? mergeScriptData<Layer>(before, owned as DeepPartial<Layer>) : { ...before, ...owned } as Layer
  assertPatch(scene, before, after)
  const command = makeUpdateLayerCmd(layerId, after, before)
  return { ...command, execute(current) {
    const latest = current.layers.find(layer => layer.id === layerId)
    if (!sameScriptValue(latest, before)) throw new Error('Layer source changed; read the current scene and prepare the edit again.')
    assertPatch(current, before, after)
    return command.execute(current)
  } }
}
