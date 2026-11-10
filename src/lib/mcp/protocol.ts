import type { ChronoScene } from '../types'
import { assertTrackValues, isColorTarget } from '../animation/typedValues'
import {measureJson} from '../format/json'
import { assertCloneForestBudget, CLONE_WORKLOAD_LIMITS } from '../clone/CloneWorkload'
import { assertSceneGuides } from '../geometry/guides/sceneGuideData'

export const MCP_VERSION = '1.1.0'
export const LIMITS = { layers: CLONE_WORKLOAD_LIMITS.layers, timelines: 100, keyframes: CLONE_WORKLOAD_LIMITS.keyframes, sceneBytes: 32 * 1024 * 1024, scriptBytes: 128 * 1024, scriptMs: 2000, scriptMemory: 32 * 1024 * 1024, commands: 20000, previewPixels: 4_194_304, requestBytes: 48 * 1024 * 1024 }
export type JsonObject = Record<string, any>
export interface BridgeJob { id: string; method: string; args: JsonObject }
export interface Snapshot { scene: ChronoScene; revision: number; selectedTimelineId?: string; currentTimeMs?: number }
export interface ToolDefinition { name: string; description: string; inputSchema: JsonObject; annotations?: { readOnlyHint: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean } }

export function assertJson(value: unknown): void {
  let nodes = 0
  function visit(input: unknown, depth: number) {
    if (++nodes > 600000 || depth > 48) throw new Error('JSON structure limit exceeded')
    if (typeof input === 'number' && !Number.isFinite(input)) throw new Error('Non-finite numbers are not allowed')
    if (!input || typeof input !== 'object') return
    for (const [key, item] of Object.entries(input)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error(`Unsafe property '${key}'`)
      visit(item, depth + 1)
    }
  }
  visit(value, 0)
}

export function assertScene(value: unknown): asserts value is ChronoScene {
  // Preflight before traversal/stringification: cycle/depth/size rejection must
  // not itself allocate a complete oversized serialized project.
  measureJson(value,{maxChars:LIMITS.sceneBytes,maxBytes:LIMITS.sceneBytes*3})
  assertJson(value)
  const scene = value as ChronoScene
  if (!scene || !scene.composition || !Array.isArray(scene.layers) || !Array.isArray(scene.timelines) || !Array.isArray(scene.assets) || !Array.isArray(scene.parameters) || !Array.isArray(scene.bindings) || !Array.isArray(scene.triggers)) throw new Error('Invalid Chorono scene')
  if (!String(scene.formatVersion).startsWith('1.')) throw new Error('Unsupported scene version')
  assertSceneGuides(scene.editorGuides)
  const comp = scene.composition
  if (comp.audioVolume !== undefined && (!Number.isFinite(comp.audioVolume) || comp.audioVolume < 0 || comp.audioVolume > 4)) throw new Error('Invalid master audio gain')
  if (comp.audioMuted !== undefined && typeof comp.audioMuted !== 'boolean') throw new Error('Invalid master audio mute')
  if (!(comp.width >= 1 && comp.width <= 8192 && comp.height >= 1 && comp.height <= 8192 && comp.frameRate >= 1 && comp.frameRate <= 120 && comp.durationMs >= 0 && comp.durationMs <= 3600000)) throw new Error('Invalid composition dimensions, duration or frame rate')
  if (scene.layers.length > LIMITS.layers || scene.timelines.length > LIMITS.timelines || scene.assets.length > 500) throw new Error('Scene object limit exceeded')
  const unique = (items: Array<{ id: string }>) => {
    const ids = new Set<string>()
    for (const item of items) {
      if (typeof item.id !== 'string' || !/^[\w-]{1,128}$/.test(item.id) || ids.has(item.id)) throw new Error(`Invalid or duplicate id '${item.id}'`)
      ids.add(item.id)
    }
    return ids
  }
  const ids = unique(scene.layers)
  const byId = new Map(scene.layers.map(layer => [layer.id, layer]))
  unique(scene.timelines)
  unique(scene.assets)
  for (const layer of scene.layers) {
    if (!layer.transform || typeof layer.type !== 'string' || typeof layer.opacity !== 'number') throw new Error('Invalid layer structure')
    for (const field of ['x', 'y', 'scaleX', 'scaleY', 'rotationDeg', 'anchorX', 'anchorY'] as const) if (!Number.isFinite(layer.transform[field])) throw new Error(`Invalid transform ${field}`)
    const seen = new Set([layer.id])
    let parent = layer.parentId
    while (parent) {
      if (!ids.has(parent) || seen.has(parent) || seen.size > 64) throw new Error('Missing, cyclic or excessively deep parent relationship')
      seen.add(parent)
      parent = byId.get(parent)?.parentId
    }
    if (layer.particleEmitter && layer.particleEmitter.emitter.maxParticles > 10000) throw new Error('Particle limit exceeded')
    if (layer.type === 'audio' && layer.audio) {
      const audio = layer.audio
      for (const [key, min, max] of [['volume', 0, 4], ['pan', -1, 1], ['startOffsetMs', 0, 3600000], ['fadeInMs', 0, 3600000], ['fadeOutMs', 0, 3600000]] as const) {
        const number = audio[key]
        if (number !== undefined && (typeof number !== 'number' || !Number.isFinite(number) || number < min || number > max)) throw new Error(`Invalid audio ${key}`)
      }
      if (audio.timelineId && !scene.timelines.some(t => t.id === audio.timelineId)) throw new Error('Audio references missing timeline')
      if (audio.fadeRange && (!Number.isFinite(audio.fadeRange.startMs) || !Number.isFinite(audio.fadeRange.endMs) || audio.fadeRange.endMs <= audio.fadeRange.startMs)) throw new Error('Invalid audio fade range')
    }
    const repeater = (layer as any).repeater
    if (repeater && Number(repeater.count ?? repeater.copies ?? 0) > 5000) throw new Error('Repeater limit exceeded')
  }
  const children = new Map<string, string[]>()
  for (const layer of scene.layers) if (layer.parentId) children.set(layer.parentId, [...(children.get(layer.parentId) ?? []), layer.id])
  const costs = new Map<string, number>()
  function renderCost(id: string, path = new Set<string>()): number {
    if (path.has(id) || path.size > 64) throw new Error('Cyclic or excessively deep render dependency')
    if (costs.has(id)) return costs.get(id)!
    const layer = byId.get(id)
    if (!layer) throw new Error(`Missing render source '${id}'`)
    const nextPath = new Set(path); nextPath.add(id)
    let cost = 1
    for (const child of children.get(id) ?? []) cost += renderCost(child, nextPath)
    if (layer.instanceOf) cost += renderCost(layer.instanceOf, nextPath)
    if (layer.repeater?.sourceLayerId) cost += Math.max(0, layer.repeater.count) * renderCost(layer.repeater.sourceLayerId, nextPath)
    for (const mask of layer.masks ?? []) cost += renderCost(mask.maskLayerId, nextPath)
    if (cost > 100000) throw new Error('Render workload limit exceeded')
    costs.set(id, cost)
    return cost
  }
  for (const layer of scene.layers) renderCost(layer.id)
  let count = 0
  for (const timeline of scene.timelines) {
    if (!Array.isArray(timeline.tracks) || !(timeline.durationMs >= 0 && timeline.durationMs <= 3600000)) throw new Error('Invalid timeline')
    for (const track of timeline.tracks) {
      if (typeof track.target !== 'string' || !Array.isArray(track.keyframes)) throw new Error('Invalid animation track')
      const layerId = track.target.match(/^layers\.([^.]+)\./)?.[1]
      if (layerId && !ids.has(layerId)) throw new Error(`Track references missing layer '${layerId}'`)
      let literal: unknown = byId.get(layerId ?? '')
      if (layerId) for (const part of track.target.slice(`layers.${layerId}.`.length).split('.')) {
        literal = literal && typeof literal === 'object' && Object.prototype.hasOwnProperty.call(literal, part)
          ? (literal as Record<string, unknown>)[part] : undefined
      }
      assertTrackValues(track, literal)
      count += track.keyframes.length
      // Audio split/move preserves support keys before zero so the audible
      // part of an easing curve is unchanged. They remain bounded, finite data.
      const audioSupport = byId.get(layerId ?? '')?.type === 'audio' && track.target.endsWith('.audio.volume')
      for (const key of track.keyframes) if (!(key.timeMs >= (audioSupport ? -3600000 : 0) && key.timeMs <= 3600000)) throw new Error('Invalid keyframe time')
    }
  }
  if (count > LIMITS.keyframes) throw new Error('Keyframe limit exceeded')
}

/** Legacy single-root MCP admission adapter. Expands the authored child tree,
 * rejects cycles, then shares layer/key-count policy with native forest clones.
 * count is NEW occurrences. This validates source workload without allocating
 * copies; it neither changes the scene nor measures runtime/GPU memory. */
export function assertCloneBudget(scene: ChronoScene, sourceId: string, count: number) {
  if (!Number.isInteger(count) || count < 1 || count > LIMITS.layers) throw new Error('Clone count limit exceeded')
  const children = new Map<string, string[]>()
  for (const layer of scene.layers) if (layer.parentId) children.set(layer.parentId, [...(children.get(layer.parentId) ?? []), layer.id])
  const ids = new Set<string>(), pending = [sourceId]
  while (pending.length) {
    const id = pending.pop()!
    if (ids.has(id)) throw new Error('Cyclic clone hierarchy')
    ids.add(id)
    pending.push(...(children.get(id) ?? []))
  }
  assertCloneForestBudget(scene, ids, count)
}

export function assertOperation(value: unknown, options: { colorValueIndex?: number; colorTarget?: boolean; uint32ValueIndex?: number } = {}): void {
  assertJson(value)
  function visit(input: any, key = '', colorTarget = options.colorTarget ?? false, root = false) {
    if (typeof input === 'number') {
      const timestamp = ['createdAt', 'updatedAt', 'importedAt'].includes(key)
      const seed = (key === 'seed' || (root && Number(key) === options.uint32ValueIndex))
        && Number.isInteger(input) && input >= 0 && input <= 0xffffffff
      const packedColor = (isColorTarget(key) || (key === 'value' && colorTarget)
        || (root && Number(key) === options.colorValueIndex)) && Number.isInteger(input) && input >= 0 && input <= 0xffffff
      if (timestamp ? !Number.isSafeInteger(input) || Math.abs(input) > 8640000000000000 : Math.abs(input) > 3600000 && !packedColor && !seed) throw new Error('Numeric input limit exceeded')
      if (/^(count|rows|columns|cols|points|sides|segments|steps|octaves|turns|resolution|samples|trailCount)$/i.test(key) && (input < 0 || input > 5000)) throw new Error(`Input limit exceeded: ${key}`)
      if (key === 'maxParticles' && (input < 0 || input > 10000)) throw new Error('Particle limit exceeded')
      if (key === 'fps' && (input < 1 || input > 120)) throw new Error('FPS must be between 1 and 120')
    }
    if (Array.isArray(input) && input.length > LIMITS.keyframes) throw new Error('Array limit exceeded')
    if (input && typeof input === 'object') {
      const localColor = colorTarget || (typeof input.target === 'string' && isColorTarget(input.target))
        || (typeof input.property === 'string' && isColorTarget(input.property))
      const rows = input.rows ?? 1, cols = input.columns ?? input.cols ?? 1
      if (rows * cols > LIMITS.layers) throw new Error('Array grid limit exceeded')
      for (const [name, item] of Object.entries(input)) visit(item, name, localColor, input === value)
    }
  }
  visit(value)
}

export function summarize(scene: ChronoScene) {
  return { composition: scene.composition, layers: scene.layers.map(l => ({ id: l.id, name: l.name, type: l.type })), timelines: scene.timelines.map(t => ({ id: t.id, durationMs: t.durationMs, loop: t.loop, tracks: t.tracks.length, keyframes: t.tracks.reduce((n, tr) => n + tr.keyframes.length, 0) })) }
}
