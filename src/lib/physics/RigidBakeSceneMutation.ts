import type { ChronoScene, Timeline, Track } from '@/lib/types'
import type { AnyFractureGeneration } from '@/lib/types/fracture'
import type { PhysicsSceneData, RigidBakeRecord } from '@/lib/types/physics'
import {
  RigidBakeOwnershipInspector,
  type RigidBakeOwnershipInspection,
} from './RigidBakeOwnership'

export type RigidBakeConflictPolicy = 'reject' | 'discard-edits'

/** Structured refusal surfaced by product and MCP lifecycle actions. */
export class RigidBakeOwnershipConflictError extends Error {
  readonly inspection: RigidBakeOwnershipInspection

  constructor(inspection: RigidBakeOwnershipInspection) {
    const detail = inspection.issues[0]
    super(detail
      ? `Bake output changed: ${detail.message} Choose Replace edited bake to continue.`
      : 'Bake output ownership could not be verified.')
    this.name = 'RigidBakeOwnershipConflictError'
    this.inspection = inspection
  }
}

/**
 * Removes one bake's proven scene output without touching unrelated content.
 *
 * `reject` is the safe default and requires all hashes/memberships to match.
 * `discard-edits` is an explicit destructive choice: it may remove one edited
 * item at every recorded target/id, but still refuses duplicate targets/ids
 * because ownership is ambiguous. Missing items are tolerated only in this
 * explicit mode. The returned scene is a fresh value; the input is borrowed.
 */
export function clearRigidBakeOwnedContent(
  scene: ChronoScene,
  recordId: string,
  policy: RigidBakeConflictPolicy = 'reject',
): ChronoScene {
  const inspection = new RigidBakeOwnershipInspector().inspect(scene, recordId)
  const ambiguous = inspection.issues.some(item => item.kind === 'duplicate-track'
    || item.kind === 'duplicate-generated-layer')
  if (ambiguous || (policy === 'reject' && !inspection.canSafelyMutate)) {
    throw new RigidBakeOwnershipConflictError(inspection)
  }

  const record = inspection.record
  const targets = new Set(record.tracks.map(track => track.target))
  const generatedLayerIds = new Set(record.generatedLayers?.map(layer => layer.layerId)
    ?? record.recipe.bodies.filter(body => body.activation).map(body => body.layerId))
  const nextTimelines = scene.timelines.map(timeline => timeline.id === record.recipe.timelineId
    ? clearTimeline(timeline, targets, generatedLayerIds, record)
    : timeline)
  const nextLayers = generatedLayerIds.size
    ? scene.layers.filter(layer => !generatedLayerIds.has(layer.id))
    : scene.layers
  const nextPhysics = clearPhysics(scene.physics!, record, inspection.generation)
  const next: ChronoScene = { ...scene, layers: nextLayers, timelines: nextTimelines, physics: nextPhysics }
  if (!nextPhysics) delete next.physics
  return next
}

function clearTimeline(
  timeline: Timeline,
  targets: ReadonlySet<string>,
  generatedLayerIds: ReadonlySet<string>,
  record: RigidBakeRecord,
): Timeline {
  const tracks = timeline.tracks.filter(track => !targets.has(track.target))
  if (timeline.layerIds === undefined) return { ...timeline, tracks }
  const membership = new Set(record.timelineLayerIdsAdded ?? generatedLayerIds)
  const layerIds = timeline.layerIds.filter(layerId => !membership.has(layerId)
    || tracks.some(track => targetLayerId(track) === layerId))
  return { ...timeline, tracks, layerIds }
}

function clearPhysics(
  physics: PhysicsSceneData,
  record: RigidBakeRecord,
  generation: AnyFractureGeneration | undefined,
): PhysicsSceneData | undefined {
  const rigidBakes = physics.rigidBakes.filter(candidate => candidate.id !== record.id)
  const generations = physics.fractureGenerations ?? []
  const fractureGenerations = generation && !rigidBakes.some(candidate => ownsGeneration(candidate, generation))
    ? generations.filter(candidate => candidate.generationId !== generation.generationId)
    : generations
  if (!rigidBakes.length && !fractureGenerations.length) return undefined
  return {
    schemaVersion: 1,
    rigidBakes,
    ...(fractureGenerations.length ? { fractureGenerations } : {}),
  }
}

function ownsGeneration(record: RigidBakeRecord, generation: AnyFractureGeneration): boolean {
  if (record.fractureGeneration) return record.fractureGeneration.generationId === generation.generationId
  const fragmentIds = new Set(record.recipe.bodies.filter(body => body.activation).map(body => body.layerId))
  const event = record.recipe.fractureEvents?.[0]
  const source = record.recipe.bodies.find(body => body.bodyId === event?.sourceBodyId)
  return source?.layerId === generation.source.ownerId
    && fragmentIds.size === generation.fragments.length
    && generation.fragments.every(fragment => fragmentIds.has(fragment.id))
}

function targetLayerId(track: Track): string | undefined {
  if (!track.target.startsWith('layers.')) return undefined
  const end = track.target.indexOf('.', 'layers.'.length)
  return end < 0 ? undefined : track.target.slice('layers.'.length, end)
}
