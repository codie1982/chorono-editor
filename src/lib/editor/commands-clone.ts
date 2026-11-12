// ── Clone & Array Commands (BL-59) ────────────────────────────────────────────
//
// Implements:
//   - makeCloneCmd(source, count, offset)       — quick / "Cmd+D"-style clone
//   - makeArrayCmd(source, settings)            — full Linear/Grid/Radial array
//   - cloneAnimationTracksForLayers(...)        — track duplication helper
//
// Both commands are wrapped in makeBatchCmd so the entire operation is
// ONE undo step, and they expose a side-channel `result` with the new
// layer ids for safe post-dispatch selection.
//
// Track duplication uses TrackTargetParser → remapTrackTarget so the
// remapping survives future track-target formats (modifier props,
// effect params, etc.).

import type { ChronoScene, Layer, Timeline, Track, Keyframe } from '../types'
import type { AuthoringHints } from '../types/authoring'
import type { EditorCommand } from './commands-keyframe'
import { makeBatchCmd } from './commands-batch'
import { makeAddLayerCmd } from './commands-layer'
import { nextKfId } from '../defaults'

import { cloneSingleLayer } from '../clone/CloneSingleLayer'
import { cloneLayerTree } from '../clone/CloneTreeResolver'
import type { CloneMetadata, CloneOptions, CloneMode } from '../clone/CloneTypes'
import {
  resolveCloneAlignSpecs,
  type CloneAlignOptions,
} from '../clone/CloneAlign'
import { makeDeleteLayerCmd } from './commands-layer'

import {
  resolveArrayTransforms,
} from '../array/ArrayTransformResolver'
import { buildArrayLayers } from '../array/ArrayLayerFactory'
import type {
  ArraySettings,
  EditorCommandResult,
} from '../array/ArrayTypes'

import {
  parseTrackTarget,
  remapTrackTarget,
  targetsLayer,
} from '../timeline/TrackTargetParser'

// ── Side-channel result extension ────────────────────────────────────────────

/**
 * Clone/array commands attach a `result` object on top of EditorCommand.
 * Use `unwrapCloneResult(cmd)` to read it without TypeScript complaints.
 */
export interface CloneArrayCommand extends EditorCommand {
  result: EditorCommandResult
  /** Per-clone metadata to attach to EditorState.layerMetaById. */
  layerMetadata: Record<string, CloneMetadata>
}

// ── Track duplication helper ─────────────────────────────────────────────────

/**
 * For every track in `timeline` whose target references a layer in
 * `idMap`, produce a duplicate track targeting the new id. Each
 * duplicated keyframe gets a fresh id, and (optionally) its timeMs
 * shifted by `timeOffsetMs`.
 *
 * Used by makeCloneCmd and makeArrayCmd to keep cloned layers animated.
 */
export function duplicateAnimationTracksForIdMap(
  timeline: Timeline,
  idMap: Record<string, string>,
  timeOffsetMs: number = 0,
  copies?: NonNullable<AuthoringHints['copies']>[number][],
): Track[] {
  const out: Track[] = []
  for (const track of timeline.tracks) {
    const parsed = parseTrackTarget(track.target)
    if (!parsed || parsed.entityType !== 'layer') continue
    if (!idMap[parsed.entityId]) continue

    const newTarget = remapTrackTarget(track.target, idMap)
    copies?.push({ from: ['track', timeline.id, track.target], to: ['track', timeline.id, newTarget] })
    const newKeyframes: Keyframe[] = track.keyframes.map(kf => {
      const id = nextKfId()
      copies?.push({ from: ['key', timeline.id, track.target, kf.id], to: ['key', timeline.id, newTarget, id] })
      return { ...kf, id, timeMs: kf.timeMs + timeOffsetMs }
    })

    out.push({
      ...track,
      target: newTarget,
      keyframes: newKeyframes,
    })
  }
  return out
}

// ── Internal: add multiple layers as one batch ───────────────────────────────

function makeAddLayersBatchCmd(layers: Layer[], label: string): EditorCommand {
  if (layers.length === 0) {
    return { label, execute: (s) => s, undo: (s) => s }
  }
  return makeBatchCmd(
    label,
    layers.map((l) => makeAddLayerCmd(l)),
  )
}

// ── Internal: add multiple tracks to a timeline as one batch ─────────────────
//
// Tracks are appended; their `target` field acts as their identity.
// If a track with the same target already exists we leave it alone
// (defensive — clone operations should never collide because we
// remapped to fresh ids first).

function makeAddTracksCmd(timelineId: string, tracks: Track[]): EditorCommand {
  if (tracks.length === 0) {
    return { label: 'Add Tracks', execute: (s) => s, undo: (s) => s }
  }
  const addedTargets = new Set(tracks.map((t) => t.target))

  return {
    label: `Add ${tracks.length} Track${tracks.length === 1 ? '' : 's'}`,
    execute(scene: ChronoScene): ChronoScene {
      return {
        ...scene,
        timelines: scene.timelines.map((tl) => {
          if (tl.id !== timelineId) return tl
          // Skip ones that already exist (idempotent guard).
          const existing = new Set(tl.tracks.map((t) => t.target))
          const toAdd = tracks.filter((t) => !existing.has(t.target))
          return { ...tl, tracks: [...tl.tracks, ...toAdd] }
        }),
      }
    },
    undo(scene: ChronoScene): ChronoScene {
      return {
        ...scene,
        timelines: scene.timelines.map((tl) =>
          tl.id !== timelineId
            ? tl
            : {
                ...tl,
                tracks: tl.tracks.filter((t) => !addedTargets.has(t.target)),
              },
        ),
      }
    },
  }
}

// ── makeCloneCmd ─────────────────────────────────────────────────────────────

export interface MakeCloneCmdParams {
  source: Layer
  /** Number of NEW clones to create. */
  count?: number
  offsetX?: number
  offsetY?: number
  /**
   * Timeline used for animation track duplication. Pass `null` to skip
   * track duplication.
   */
  timeline: Timeline | null
  /** All layers in the scene (needed for group cloning). */
  allLayers: Layer[]
  /** Default true. False → skip animation duplication for this op. */
  duplicateAnimation?: boolean
  /** Default 'copy'. 'instance' tags the clone for future hot-swap render. */
  mode?: CloneMode
}

export function makeCloneCmd(params: MakeCloneCmdParams): CloneArrayCommand {
  const {
    source,
    count = 1,
    offsetX = 20,
    offsetY = 20,
    timeline,
    allLayers,
    duplicateAnimation = true,
    mode = 'copy',
  } = params

  const newLayers: Layer[] = []
  const newTracks: Track[] = []
  const copies: NonNullable<AuthoringHints['copies']>[number][] = []
  const layerMetadata: Record<string, CloneMetadata> = {}
  const arrayGroupId = `clone_${Date.now()}_${Math.floor(Math.random() * 1e6)}`

  const isGroupSource = source.type === 'group'

  for (let i = 0; i < count; i++) {
    // Incremental offset — clone i is at (i+1)*offset from source.
    const stepOffsetX = offsetX * (i + 1)
    const stepOffsetY = offsetY * (i + 1)

    const cloneOptions: CloneOptions = {
      mode,
      offsetX: stepOffsetX,
      offsetY: stepOffsetY,
      arrayGroupId,
    }

    if (isGroupSource) {
      const tree = cloneLayerTree(source, allLayers, cloneOptions)
      for (const c of tree.allClones) newLayers.push(c)
      for (const [newId, meta] of Object.entries(tree.metadata)) {
        layerMetadata[newId] = meta
      }
      if (duplicateAnimation && timeline) {
        const tracks = duplicateAnimationTracksForIdMap(timeline, tree.idMap, 0, copies)
        for (const t of tracks) newTracks.push(t)
      }
    } else {
      const { clonedLayer, idMap, metadata } = cloneSingleLayer(
        source,
        cloneOptions,
      )
      newLayers.push(clonedLayer)
      layerMetadata[clonedLayer.id] = metadata
      if (duplicateAnimation && timeline) {
        const tracks = duplicateAnimationTracksForIdMap(timeline, idMap, 0, copies)
        for (const t of tracks) newTracks.push(t)
      }
    }
  }

  const label = `Clone ${source.name} (${count} ${count === 1 ? 'copy' : 'copies'})`
  const subCommands: EditorCommand[] = [
    makeAddLayersBatchCmd(newLayers, `Add ${newLayers.length} cloned layer(s)`),
  ]
  if (timeline && newTracks.length > 0) {
    subCommands.push(makeAddTracksCmd(timeline.id, newTracks))
  }

  const batch = makeBatchCmd(label, subCommands)

  // Selection: only the new root clones (not their children).
  const rootCloneIds = newLayers
    .filter((l) => layerMetadata[l.id])
    .filter((l) => l.parentId === source.parentId)
    .map((l) => l.id)

  return {
    ...batch,
    authoring: { ...batch.authoring, copies },
    layerMetadata,
    result: {
      label,
      createdLayerIds: newLayers.map((l) => l.id),
      createdTrackTargets: newTracks.map((t) => t.target),
      suggestedSelection: rootCloneIds,
    },
  }
}

// ── makeArrayCmd ─────────────────────────────────────────────────────────────

export interface MakeArrayCmdParams {
  source: Layer
  settings: ArraySettings
  /** Timeline used for animation track duplication. Pass `null` to skip. */
  timeline: Timeline | null
  /** All layers in the scene (needed for group cloning). */
  allLayers: Layer[]
}

export function makeArrayCmd(params: MakeArrayCmdParams): CloneArrayCommand {
  const { source, settings, timeline, allLayers } = params

  // 1. Compute transforms (pure math).
  const transforms = resolveArrayTransforms(source, settings, allLayers)

  // 2. Build new layers.
  const factory = buildArrayLayers(source, transforms, settings, allLayers)

  // 3. Duplicate animation tracks if requested.
  const newTracks: Track[] = []
  const copies: NonNullable<AuthoringHints['copies']>[number][] = []
  if (settings.duplicateAnimation && timeline) {
    for (let i = 0; i < factory.perInstanceIdMaps.length; i++) {
      const idMap = factory.perInstanceIdMaps[i]
      if (!idMap || Object.keys(idMap).length === 0) continue
      const offset = (settings.timeOffsetMs ?? 0) * i
      const dup = duplicateAnimationTracksForIdMap(timeline, idMap, offset, copies)
      for (const t of dup) newTracks.push(t)
    }
  }

  // 4. Wrap in batch.
  const totalNew = factory.newLayers.length
  const totalInScene = transforms.length
  const label = `Array ${source.name} (${totalInScene} total, ${totalNew} new)`
  const subCommands: EditorCommand[] = [
    makeAddLayersBatchCmd(factory.newLayers, `Add ${totalNew} array clone(s)`),
  ]
  if (timeline && newTracks.length > 0) {
    subCommands.push(makeAddTracksCmd(timeline.id, newTracks))
  }
  const batch = makeBatchCmd(label, subCommands)

  // Selection: only new root clones — siblings of source.
  const rootCloneIds: string[] = []
  for (const id of factory.indexToLayerId) {
    if (!id) continue
    const layer = factory.newLayers.find((l) => l.id === id)
    if (!layer) continue
    if (layer.parentId === source.parentId) rootCloneIds.push(id)
  }

  return {
    ...batch,
    authoring: { ...batch.authoring, copies },
    layerMetadata: factory.metadata,
    result: {
      label,
      createdLayerIds: factory.newLayers.map((l) => l.id),
      createdTrackTargets: newTracks.map((t) => t.target),
      suggestedSelection: rootCloneIds,
    },
  }
}

// ── makeCloneAlignCmd (BL-59 Phase 2) ────────────────────────────────────────

export interface MakeCloneAlignCmdParams {
  source: Layer
  targets: Layer[]
  options: CloneAlignOptions
  timeline: Timeline | null
  allLayers: Layer[]
  /** Defaults to true (kept for parity with Clone/Array commands). */
  duplicateAnimation?: boolean
}

/**
 * For each target, clone `source` and align the clone to the target's
 * transform. Optionally deletes the target (replaceTarget). All ops in
 * one atomic undo step.
 */
export function makeCloneAlignCmd(params: MakeCloneAlignCmdParams): CloneArrayCommand {
  const {
    source, targets, options, timeline, allLayers,
    duplicateAnimation = true,
  } = params

  const specs = resolveCloneAlignSpecs(source, targets, options)
  const arrayGroupId = `clonealign_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
  const isGroupSource = source.type === 'group'

  const newLayers: Layer[] = []
  const newTracks: Track[] = []
  const copies: NonNullable<AuthoringHints['copies']>[number][] = []
  const layerMetadata: Record<string, CloneMetadata> = {}
  const replaceCmds: EditorCommand[] = []

  for (const spec of specs) {
    const cloneOptions: CloneOptions = { mode: 'copy', arrayGroupId }

    if (isGroupSource) {
      const tree = cloneLayerTree(source, allLayers, cloneOptions)
      // Apply alignment to the cloned root only.
      tree.clonedRoot.transform = {
        ...tree.clonedRoot.transform,
        x: spec.position.x,
        y: spec.position.y,
        rotationDeg: spec.rotation,
        scaleX: spec.scaleX,
        scaleY: spec.scaleY,
      }
      tree.allClones[0] = tree.clonedRoot
      for (const c of tree.allClones) newLayers.push(c)
      for (const [id, meta] of Object.entries(tree.metadata)) {
        layerMetadata[id] = meta
      }
      if (duplicateAnimation && timeline) {
        const tracks = duplicateAnimationTracksForIdMap(timeline, tree.idMap, 0, copies)
        for (const t of tracks) newTracks.push(t)
      }
    } else {
      const { clonedLayer, idMap, metadata } = cloneSingleLayer(source, cloneOptions)
      clonedLayer.transform = {
        ...clonedLayer.transform,
        x: spec.position.x,
        y: spec.position.y,
        rotationDeg: spec.rotation,
        scaleX: spec.scaleX,
        scaleY: spec.scaleY,
      }
      newLayers.push(clonedLayer)
      layerMetadata[clonedLayer.id] = metadata
      if (duplicateAnimation && timeline) {
        const tracks = duplicateAnimationTracksForIdMap(timeline, idMap, 0, copies)
        for (const t of tracks) newTracks.push(t)
      }
    }

    // Replace target by deleting it (atomic undo restores it).
    if (options.replaceTarget) {
      replaceCmds.push(makeDeleteLayerCmd(spec.target))
    }
  }

  const label = `Clone & Align "${source.name}" → ${specs.length} target${
    specs.length === 1 ? '' : 's'
  }`
  const subCommands: EditorCommand[] = [
    makeAddLayersBatchCmd(newLayers, `Add ${newLayers.length} aligned clone(s)`),
    ...replaceCmds,
  ]
  if (timeline && newTracks.length > 0) {
    subCommands.push(makeAddTracksCmd(timeline.id, newTracks))
  }

  const batch = makeBatchCmd(label, subCommands)

  const rootCloneIds = newLayers
    .filter((l) => l.parentId === source.parentId)
    .map((l) => l.id)

  return {
    ...batch,
    authoring: { ...batch.authoring, copies },
    layerMetadata,
    result: {
      label,
      createdLayerIds: newLayers.map((l) => l.id),
      createdTrackTargets: newTracks.map((t) => t.target),
      suggestedSelection: rootCloneIds,
    },
  }
}

// ── Helper: read result without TS gymnastics ────────────────────────────────

export function isCloneArrayCommand(
  cmd: EditorCommand,
): cmd is CloneArrayCommand {
  return (
    typeof (cmd as CloneArrayCommand).result === 'object' &&
    (cmd as CloneArrayCommand).result !== null
  )
}

// Suppress unused-import lint when targetsLayer isn't used directly
// (keeps the import in place so future track-filter code has it ready).
void targetsLayer
