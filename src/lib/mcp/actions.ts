import { actionRegistry, bootstrapAIActions } from '../ai/ActionRegistry'
import type { ActionDef } from '../ai/ActionRegistry'
import type { ChronoScene, Layer } from '../types'
import { createSceneAPI } from '../script/api/SceneAPI'
import type { SceneAPI } from '../script/api/SceneAPI'
import { makeBatchCmd } from '../editor/commands-batch'
import type { EditorCommand } from '../editor/commands-keyframe'
import { makeGroupCmd, makeUngroupCmd } from '../editor/commands-group'
import { layerRegistry } from '../registry'
import { makeAddAudioClipCmd, makePatchAudioClipCmd, makeMoveAudioClipCmd, makeTrimAudioClipCmd, makeSplitAudioClipCmd, makeSetAudioGainKeyCmd } from '../editor/commands-audio'
import { dbToGain } from '../audio/audioClip'
import { keyframeInputSchema } from '../animation/typedValueSchema'
import { layerPatchSchema, particlePatchSchema } from './schema/registryPayloadSchemas'
import { modifierSchema } from './schema/modifierSchema'
import { trackPatchSchema } from './schema/trackPatchSchema'

let ready: Promise<void> | undefined
const str = { type: 'string', description: 'String value in the native model; use returned stable ids for references.' }
const obj = { type: 'object' }
const num = { type: 'number' }
const layerId = { type: 'string', description: 'Existing layer id from get_scene or a creation result; display names are not ids.' }
const timelineId = { type: 'string', description: 'Existing timeline id from get_scene or list_timelines; independent of the UI-selected timeline.' }
const target = { type: 'string', description: 'Full track target, for example layers.hero.transform.x. Use the same target as the existing track; positions are pixels, rotations degrees, opacity 0..1.' }

/** Collect native SceneAPI commands against a working scene and return one atomic undo command; errors leave the host scene untouched. */
function scripted(label: string, scene: ChronoScene, run: (api: SceneAPI) => void): EditorCommand {
  let working = scene
  const commands: EditorCommand[] = []
  const api = createSceneAPI({ getScene: () => working, applyCommand: cmd => { commands.push(cmd); working = cmd.execute(working) } }, () => {})
  run(api)
  return makeBatchCmd(label, commands)
}

/** Register MCP-only native command adapters once after the shared AI actions.
 * Public payload hints reuse registry/animation metadata; command execution,
 * particle validation and undo ownership remain in the existing domain APIs.
 * This bootstrap allocates schema data, never a scene or browser resource. */
export function bootstrapMCPActions(): Promise<void> {
  return ready ??= bootstrapAIActions().then(() => {
    const audioAction = (name: string, description: string, properties: Record<string, any>, required: string[], toCommand: (p: any, scene: ChronoScene) => EditorCommand) => {
      actionRegistry.register({ id: `mcp.${name}`, toolName: name, description,
        parameters: { type: 'object', properties, required }, toCommand })
    }
    const time = { type: 'number', minimum: 0, description: 'Nonnegative timeline time or fade duration in milliseconds, as named by this field.' }
    audioAction('set_audio_master', 'Set saved master mix gain in dB (-60..12) and/or mute without losing its gain setting.',
      { gainDb: { type: 'number', minimum: -60, maximum: 12, description: 'Gain in decibels, -60..12; 0 dB is unity gain.' }, muted: { type: 'boolean', description: 'Mute without changing gain; omit to retain the current mute state.' } }, [], (p, scene) => {
        if (p.gainDb === undefined && p.muted === undefined) throw new Error('Supply gainDb or muted')
        return { label: 'Set Audio Master', execute: s => ({ ...s, composition: { ...s.composition,
          ...(p.gainDb === undefined ? {} : { audioVolume: dbToGain(p.gainDb) }), ...(p.muted === undefined ? {} : { audioMuted: p.muted }) } }), undo: () => scene }
      })
    audioAction('add_audio_clip', 'Add an editable audio clip from an existing audio asset to an explicit timeline. Placement, membership and duration are one undo step.',
      { assetId: { type: 'string', description: 'Existing audio asset id from the scene assets list.' }, timelineId, startMs: time, name: { type: 'string', description: 'Optional display name for the new audio clip.' }, layerId }, ['assetId', 'timelineId'], (p, scene) => {
        const asset = scene.assets.find(a => a.id === p.assetId && a.type === 'audio')
        if (!asset) throw new Error('Audio asset not found')
        return makeAddAudioClipCmd(asset, p)
      })
    audioAction('set_audio_gain', 'Set gain in dB (-60..12). If gain is animated, supply timeMs (and optional timelineId) to key the value at that time. Mute is separate; existing automation is preserved.',
      { layerId, gainDb: { type: 'number', minimum: -60, maximum: 12, description: 'Gain in decibels, -60..12; 0 dB is unity gain.' }, muted: { type: 'boolean', description: 'Mute without changing gain; omit to retain the current mute state.' }, timeMs: time, timelineId }, ['layerId', 'gainDb'], (p, scene) => {
        const layer = scene.layers.find(layer => layer.id === p.layerId && layer.type === 'audio')
        const target = `layers.${p.layerId}.audio.volume`
        const candidates = scene.timelines.filter(t => t.tracks.some(track => track.target === target))
        const timeline = scene.timelines.find(t => t.id === (p.timelineId ?? layer?.audio?.timelineId)) ?? (candidates.length === 1 ? candidates[0] : undefined)
        if (p.timelineId && !scene.timelines.some(t => t.id === p.timelineId)) throw new Error('Audio timeline not found')
        if (!timeline && candidates.length > 1) throw new Error('Choose timelineId for the animated gain')
        const animated = timeline?.tracks.some(t => t.target === target)
        if (animated || p.timeMs !== undefined) {
          if (p.timeMs === undefined) throw new Error('Gain is animated; supply timeMs to edit a gain keyframe')
          if (!timeline) throw new Error('Choose timelineId to add a gain keyframe')
          return makeBatchCmd('Set Audio Gain Key', [makeSetAudioGainKeyCmd(p.layerId, p.timeMs, dbToGain(p.gainDb), { timelineId: timeline.id }),
            ...(p.muted === undefined ? [] : [makePatchAudioClipCmd(p.layerId, { muted: p.muted })])])
        }
        return makePatchAudioClipCmd(p.layerId, { volume: dbToGain(p.gainDb), ...(p.muted === undefined ? {} : { muted: p.muted }) })
      })
    audioAction('set_audio_fades', 'Set non-destructive linear fade-in/out durations in milliseconds. The envelope multiplies gain automation.',
      { layerId, fadeInMs: time, fadeOutMs: time }, ['layerId'], p => {
        if (p.fadeInMs === undefined && p.fadeOutMs === undefined) throw new Error('Supply fadeInMs or fadeOutMs')
        return makePatchAudioClipCmd(p.layerId, { ...(p.fadeInMs === undefined ? {} : { fadeInMs: p.fadeInMs }), ...(p.fadeOutMs === undefined ? {} : { fadeOutMs: p.fadeOutMs }) })
      })
    audioAction('move_audio_clip', 'Move a clip without changing its source-in. Moves only its owning timeline gain automation, in one undo step.',
      { layerId, startMs: time }, ['layerId', 'startMs'], p => makeMoveAudioClipCmd(p.layerId, p.startMs))
    audioAction('trim_audio_clip', 'Non-destructively trim timeline clip edges. Left trim advances source-in by the same amount; source limits are enforced.',
      { layerId, startMs: time, endMs: time, timelineId }, ['layerId'], p => {
        if (p.startMs === undefined && p.endMs === undefined) throw new Error('Supply startMs or endMs')
        return makeTrimAudioClipCmd(p.layerId, { startMs: p.startMs, endMs: p.endMs }, { timelineId: p.timelineId })
      })
    audioAction('split_audio_clip', 'Split an audio clip at timeline time. Shares the source asset, advances the right source-in, preserves gain/fades, and is one undo step.',
      { layerId, timeMs: time, timelineId, rightLayerId: { type: 'string', description: 'Optional unique id for the new right-hand clip; generated when omitted.' } }, ['layerId', 'timeMs'], p =>
        makeSplitAudioClipCmd(p.layerId, p.timeMs, { timelineId: p.timelineId, rightLayerId: p.rightLayerId }))
    audioAction('patch_audio_clip', 'Validate and patch audio clip settings (linear volume 0..4, mute, loop, pan -1..1, fades, source-in, timeline ownership). Use set_audio_gain for dB.',
      { layerId, patch: { type: 'object', description: 'Audio settings to update; omitted settings are retained. Unknown settings are rejected.' }, timelineId }, ['layerId', 'patch'], p => makePatchAudioClipCmd(p.layerId, p.patch, { timelineId: p.timelineId }))
    const register = (name: string, description: string, properties: Record<string, any>, required: string[], run: (p: any, api: SceneAPI, scene: ChronoScene) => void) => {
      actionRegistry.register({ id: `mcp.${name}`, toolName: name, description, parameters: { type: 'object', properties, required }, toCommand: (p, scene) => scripted(name, scene, api => run(p, api, scene)) })
    }
    register('create_object', 'Create one registry-kind Layer with nested source data in one undo step. Use this for kinds discovered in get_capabilities; add_layer is the legacy flat-field creator, while add_spline/add_path offer geometry-specific setup. patch shallowly replaces nested fields on the new default.', { kind: { ...str, description: 'Exact registered kind returned by get_capabilities.objectKinds.' }, patch: layerPatchSchema() }, ['kind'], (p, api) => { api.add(p.kind).set(p.patch ?? {}) })
    register('patch_object', 'Shallowly replace specified fields on an existing Layer in one undo step. Nested objects replace in full; read the layer and include siblings to preserve them. For a safe recursive object merge use layer.patch in run_script. update_layer is the legacy flat-field setter.', { layerId, patch: layerPatchSchema() }, ['layerId', 'patch'], (p, api) => {
      const layer = api.get(p.layerId)
      if (!layer) throw new Error('Layer not found')
      if ('id' in p.patch || 'type' in p.patch) throw new Error('Cannot change object id or type')
      layer.set(p.patch)
    })
    register('update_timeline', 'Shallowly update one existing timeline in one undo step. Fields/arrays supplied in patch replace in full; id and tracks remain unchanged. Use update_track for track data. durationMs, marker and segment times are timeline-local milliseconds.', { timelineId, patch: { ...obj, description: 'Partial Timeline fields excluding id/tracks: durationMs, loop, pingPong, autoplay, workArea, layerIds, markers, segments or events. Read current arrays before replacement; omitted fields remain unchanged.' } }, ['timelineId', 'patch'], (p, api) => api.timeline(p.timelineId).set(p.patch))
    register('clone_timeline', 'Duplicate an animation including keyframes, curves, modifiers, events and segments with a new timeline id.', { timelineId, newId: str }, ['timelineId', 'newId'], (p, api) => { api.cloneTimeline(p.timelineId, p.newId) })
    register('delete_timeline', 'Delete one timeline. Refuses timelines referenced by state machines.', { timelineId }, ['timelineId'], (p, api) => api.deleteTimeline(p.timelineId))
    register('set_keyframes', 'Upsert individual keys on an existing explicit timeline and Layer property in one undo step; keys at other times remain. Unlike add_keyframes, the timeline must already exist and addressing uses layerId/property. New keys default to linear easing on the starting key. Exact-time updates preserve existing IDs, tangents, segment settings and omitted easing; explicit easing replaces it. Equality uses 1e-6 ms and neighbouring keys remain separate; use update_track only for intentional complete key-array replacement.', { timelineId, layerId, property: { ...str, description: 'Layer-relative source property path, e.g. transform.x or style.fill.color; no layers.<id> prefix.' }, keyframes: { type: 'array', description: 'Keys to upsert; the native key command owns time collision handling. An empty array is a no-op.', items: keyframeInputSchema() } }, ['timelineId', 'layerId', 'property', 'keyframes'], (p, api) => {
      if (!api.get(p.layerId)) throw new Error('Layer not found')
      const tl = api.timeline(p.timelineId)
      for (const key of p.keyframes) tl.key(p.layerId, p.property, key.timeMs, key.value, key.easing)
    })
    register('update_track', 'Shallowly configure one track on an existing timeline, creating an empty track if absent. Each provided field replaces in full, including keyframes/controller/modifiers. Prefer set_keyframes for individual key upserts and add_modifier to append one modifier. One undo step.', { timelineId, target, patch: trackPatchSchema() }, ['timelineId', 'target', 'patch'], (p, api) => { api.timeline(p.timelineId).track(p.target, p.patch) })
    register('remove_track', 'Remove an animation track from an explicit timeline.', { timelineId, target }, ['timelineId', 'target'], (p, api) => { api.timeline(p.timelineId).removeTrack(p.target) })
    register('add_modifier', 'Append a scalar numeric modifier to one track, creating an empty track if needed, in one undo step. Registered kinds/default parameters are described in modifier. Track timeWarp is configured with update_track; legacy modifier kind timeWarp is a no-op.', { timelineId, target, modifier: modifierSchema() }, ['timelineId', 'target', 'modifier'], (p, api) => { api.timeline(p.timelineId).modifier(p.target, p.modifier) })
    register('bake_track', 'Convert a scalar numeric track to linear keys in a local-ms window (default full timeline). Removes controller/OOR/modifiers/time remapping globally; keeps unrelated metadata and keys outside the window. FPS is positive up to 240; tolerance 0..1 bounds normalized vertical simplification error at samples, not continuous error. At most 20000 samples; rejects stale/non-finite source. One undo.', { timelineId, target, fps: { ...num, exclusiveMinimum: 0, maximum: 240, description: 'Samples per second, greater than zero up to 240; default 60.' }, tolerance: { ...num, minimum: 0, maximum: 1, description: 'Normalized vertical simplification error at sampled points, 0..1; default 0.005.' }, startMs: { ...num, minimum: 0, description: 'Local timeline start time in milliseconds; defaults to zero.' }, endMs: { ...num, minimum: 0, description: 'Local timeline end time in milliseconds; defaults to timeline duration.' } }, ['timelineId', 'target'], (p, api) => { api.timeline(p.timelineId).bake(p.target, p.fps, p.tolerance, { startMs: p.startMs, endMs: p.endMs }) })
    register('configure_particles', 'Deep-merge ParticleEmitterData on an existing emitter in one undo step. Objects merge, arrays/scalars replace; layer transform and unrelated data remain. Use for emitter, life gradients, motion modifiers and rendering settings, not a new emitter or a fluid/rigid-body solver.', { layerId, config: particlePatchSchema() }, ['layerId', 'config'], (p, api) => {
      const handle = api.get(p.layerId)
      if (!handle || handle.type !== 'particleEmitter') throw new Error('Particle emitter not found')
      handle.configureParticles(p.config)
    })
    register('edit_entity', 'Add, shallow-update or remove an authored parameter, trigger, binding, wire or state machine by id. Add requires a unique id; update/remove require an existing id. value arrays/nested objects replace existing values and id stays fixed. Prefer the dedicated add_* tools for initial creation; control_runtime changes live values without changing authored defaults.', {
      collection: { type: 'string', enum: ['parameters', 'triggers', 'bindings', 'parameterWires', 'stateMachines'], description: 'Scene collection containing the record; read current records with get_scene.' },
      operation: { type: 'string', enum: ['add', 'update', 'remove'], description: 'add inserts a new record, update merges top-level fields, remove deletes it.' },
      id: { type: 'string', description: 'Stable record id, unique in this collection. For state-machine changes, keep referenced timelines/states consistent.' },
      value: { type: 'object', description: 'Record fields for add, or shallow partial fields for update. Ignored for remove; use the current model fields from get_scene.' },
    }, ['collection', 'operation', 'id'], () => {})
    const entity = actionRegistry.get('edit_entity')!
    entity.toCommand = (p: any, scene) => {
      const collection = p.collection as 'parameters'
      const prev = scene[collection] ?? []
      const exists = prev.some(item => item.id === p.id)
      if (p.operation === 'add' ? exists : !exists) throw new Error('Entity must exist for update/remove, and be unique for add')
      const next = p.operation === 'remove' ? prev.filter(item => item.id !== p.id) : p.operation === 'add' ? [...prev, { ...p.value, id: p.id }] : prev.map(item => item.id === p.id ? { ...item, ...p.value, id: p.id } : item)
      return { label: `Edit ${collection}`, execute: s => ({ ...s, [collection]: next }), undo: s => ({ ...s, [collection]: prev }) }
    }
    actionRegistry.register({ id: 'mcp.listTimelines', toolName: 'list_timelines', description: 'Read all timeline records, including duration, loop settings, tracks, segments and events, as a JSON-encoded content string. Use describe_timeline for a shorter track/keyframe summary or get_scene for timelines with the rest of the scene.', parameters: { type: 'object', properties: {} }, read: (_, scene) => JSON.stringify(scene.timelines) })
    actionRegistry.register({ id: 'mcp.group', toolName: 'group_layers', description: 'Wrap existing layers under a new identity-transform group. Returns its id in addedLayerIds. Existing local transforms are retained, so grouping layers from differently transformed parents may change their appearance. Prefer siblings with a common parent; use ungroup_layer to dissolve a group, or patch_object for explicit parent changes.', parameters: { type: 'object', required: ['layerIds'], properties: { layerIds: { type: 'array', items: { type: 'string' }, description: 'Nonempty array of existing layer ids to group. Array order does not change the authored scene stacking order.' } } }, toCommand: (p: any, scene) => {
      if (!p.layerIds.length || p.layerIds.some((id: string) => !scene.layers.some(l => l.id === id))) throw new Error('Layer ids must exist')
      return makeGroupCmd(p.layerIds)
    } })
    actionRegistry.register({ id: 'mcp.ungroup', toolName: 'ungroup_layer', description: 'Remove an existing group and promote its children to its parent. Bakes the static group transform into children and copies group property keys where a child lacks its own track. This is not general animation/compositing equivalence for complex groups; inspect render_preview afterwards. Use group_layers to create a group or delete_layer to remove it and its descendants.', parameters: { type: 'object', required: ['layerId'], properties: { layerId } }, toCommand: (p: any, scene) => {
      const group = scene.layers.find(l => l.id === p.layerId)
      if (group?.type !== 'group') throw new Error('Group not found')
      return makeUngroupCmd(scene, group.id)
    } } as ActionDef<any>)
  })
}
