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

let ready: Promise<void> | undefined
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

/** Register MCP-native action implementations and their input documentation once, extending the existing AI/UI action registry. */
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
    register('create_object', 'Create one registered object with generated defaults and an optional Layer patch. Use for kinds discovered by get_capabilities; add_layer instead accepts flat fields and a caller-chosen id. Read the returned addedLayerIds before subsequent edits.', {
      kind: { type: 'string', description: 'Registered kind id from get_capabilities.objectKinds, for example rect, circle, text or particleEmitter.' },
      patch: { type: 'object', description: 'Optional Partial<Layer> applied over defaults, for example {name:"Hero",opacity:0.8}. Nested objects replace their default value; preserve required transform/style fields.' },
    }, ['kind'], (p, api) => { api.add(p.kind).set(p.patch ?? {}) })
    register('patch_object', 'Change model fields on an existing layer, including typography, transforms, effects, masks, geometry and repeater settings. This is a shallow patch: nested objects replace existing values. Read get_scene for complete nested data; describe_layer is only a summary. Use update_layer for flat fields or configure_particles for emitter/particle-field merging. id/type changes fail.', {
      layerId,
      patch: { type: 'object', description: 'Partial<Layer>; omitted top-level fields stay unchanged, supplied nested objects/arrays replace them. Do not include id or type. Example: {opacity:0.5}.' },
    }, ['layerId', 'patch'], (p, api) => {
      const layer = api.get(p.layerId)
      if (!layer) throw new Error('Layer not found')
      if ('id' in p.patch || 'type' in p.patch) throw new Error('Cannot change object id or type')
      layer.set(p.patch)
    })
    register('update_timeline', 'Change one existing timeline settings; omitted fields and tracks are preserved. Extending its duration also extends composition duration when needed; shortening does not shorten the composition. Use update_track/set_keyframes for tracks, create_timeline for a new animation, or control_playback for live transport.', {
      timelineId,
      patch: { type: 'object', description: 'Shallow timeline patch: durationMs (milliseconds), loop, loopCount, pingPong, autoplay, workArea, layerIds, markers, segments or events. Arrays replace existing arrays; id/tracks cannot be changed here.' },
    }, ['timelineId', 'patch'], (p, api) => api.timeline(p.timelineId).set(p.patch))
    register('clone_timeline', 'Copy timeline data, tracks, curves, modifiers, events and segments under a new timeline id. Both timelines reference the same scene layers; this does not duplicate objects. The source must exist and newId must be unique. Use clone_layer to duplicate objects instead.', {
      timelineId, newId: { type: 'string', description: 'New unique timeline id (letters, digits, underscores or hyphens, at most 128 characters), for example idle-loop.' },
    }, ['timelineId', 'newId'], (p, api) => { api.cloneTimeline(p.timelineId, p.newId) })
    register('delete_timeline', 'Remove one timeline and its tracks without deleting scene layers. Fails if the timeline is missing or referenced by a state-machine state; edit_entity can update those references. Use remove_track to remove just one property animation.', { timelineId }, ['timelineId'], (p, api) => api.deleteTimeline(p.timelineId))
    register('set_keyframes', 'Upsert keys on an explicit timeline and layer-relative property, preserving other keys/tracks. The timeline and layer must exist. Easing belongs to the starting keyframe; customBezier is supported. Use add_keyframes for the legacy numeric full-target format, or update_track to replace an entire keyframe array.', {
      timelineId, layerId,
      property: { type: 'string', description: 'Layer-relative property path, for example opacity or transform.x; do not prefix layers.<id>. Values must match the property model.' },
      keyframes: { type: 'array', description: 'Keys to insert or replace at matching times. Other keyframes remain unchanged.', items: {
        type: 'object', required: ['timeMs', 'value'], properties: {
          timeMs: { type: 'number', description: 'Nonnegative absolute timeline time in milliseconds. Late keys can extend the timeline duration.' },
          value: { description: 'Animatable property value; numeric for signal modifiers/baking, or a supported model value such as a color string or {x,y} vector.' },
          easing: { description: 'Default linear. linear, hold, easeIn, easeOut, easeInOut, or {type:"customBezier",bezier:{cx1,cy1,cx2,cy2}}. Applied from this key toward the next.' },
        },
      } },
    }, ['timelineId', 'layerId', 'property', 'keyframes'], (p, api) => {
      if (!api.get(p.layerId)) throw new Error('Layer not found')
      const tl = api.timeline(p.timelineId)
      for (const key of p.keyframes) tl.key(p.layerId, p.property, key.timeMs, key.value, key.easing)
    })
    register('update_track', 'Shallow-patch one track in an existing timeline, creating an empty track if the target is missing. Supplied keyframe/modifier arrays replace existing arrays. Use set_keyframes to preserve unrelated keys, add_modifier to append one modifier, or bake_track to flatten procedural motion.', {
      timelineId, target,
      patch: { type: 'object', description: 'Track fields such as keyframes, outOfRange, easeCurve, timeWarp, multiplierCurve, multiplierAmplitude, controller or modifiers. Read get_scene for current values; preserve nested settings. Keep target unchanged.' },
    }, ['timelineId', 'target', 'patch'], (p, api) => { api.timeline(p.timelineId).track(p.target, p.patch) })
    register('remove_track', 'Remove the matching property track, including all its keys, controller and modifiers, from one existing timeline. Leaves the layer and other timelines unchanged; a missing target is a no-op scene transaction. Use update_track or set_keyframes to edit rather than delete animation.', { timelineId, target }, ['timelineId', 'target'], (p, api) => { api.timeline(p.timelineId).removeTrack(p.target) })
    register('add_modifier', 'Append a numeric signal modifier to a track; creates an empty track if missing. Defaults to enabled, additive blending and weight 1. Modifier order affects evaluation. Use update_track to replace/reorder the stack, or bake_track to flatten it into keys.', {
      timelineId, target,
      modifier: { type: 'object', description: 'CurveModifier config. type: sine, pulse, quantize, offset, scale, clamp, wave, noise, fractalNoise, jitter, timeWarp, bounce, elastic, overshoot, decay or spring. Optional parameters, enabled, weight and blendMode (add/multiply/replace/blend). Example: {type:"sine",parameters:{amplitude:20,frequency:1}}; amplitude uses property units, sine frequency counts cycles over the normalized track/segment range.' },
    }, ['timelineId', 'target', 'modifier'], (p, api) => { api.timeline(p.timelineId).modifier(p.target, p.modifier) })
    register('bake_track', 'Sample one existing numeric track over 0..timeline.durationMs into editable linear keys, then simplify them. Replaces its keys and removes procedural/modifier/curve settings; use undo to recover the authored stack. Limited by the 50,000-key workload budget. Use evaluate_frame to inspect values without replacing the track.', {
      timelineId, target,
      fps: { type: 'number', description: 'Sampling rate in frames per second, 1..120; default 60. Higher rates capture faster motion but generate more samples.' },
      tolerance: { type: 'number', description: 'RDP simplification tolerance as a fraction of the time/value bounding box; default 0.005. Zero keeps all samples; typical values 0.005..0.02.' },
    }, ['timelineId', 'target'], (p, api) => { api.timeline(p.timelineId).bake(p.target, p.fps, p.tolerance) })
    register('configure_particles', 'Update a particleEmitter layer while preserving omitted emitter and particle fields. Merges config, emitter and particle one level deep; deeper objects/arrays replace existing values. Missing/non-emitter layers fail. Use add_particle_emitter to create from a preset, get_scene to inspect full settings, or set_keyframes for animated properties.', {
      layerId,
      config: { type: 'object', description: 'Partial particleEmitter data, for example {emitter:{maxParticles:100,loop:false}}. At most 10,000 particles. emitter/particle fields are shallow-merged; preserve existing deeper settings when replacing them.' },
    }, ['layerId', 'config'], (p, api) => {
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
