import { FractureRigidRecipeCompiler } from '@/lib/fracture/FractureRigidRecipeCompiler'
import { FractureRecursiveRecipeCompiler } from '@/lib/fracture/FractureRecursiveRecipeCompiler'
import { canonicalJson, hashCanonicalRecords } from '@/lib/hash/CanonicalRecordHash'
import type { ChronoScene, Layer, Track } from '@/lib/types'
import type { AnyFractureGeneration } from '@/lib/types/fracture'
import type {
  RigidBakeRecord,
  RigidBodyBakeRecipe,
} from '@/lib/types/physics'
import { RigidBodySceneCompiler } from './RigidBodySceneCompiler'
import { hashRigidBakeTrack } from './RigidPoseTrackCompiler'

export type RigidBakeOwnershipState = 'current' | 'edited' | 'incomplete' | 'legacy'
export type RigidBakeSourceState = 'current' | 'changed' | 'unavailable'

export type RigidBakeOwnershipIssueKind =
  | 'missing-timeline'
  | 'missing-track'
  | 'duplicate-track'
  | 'modified-track'
  | 'unverified-generated-layers'
  | 'missing-generated-layer'
  | 'duplicate-generated-layer'
  | 'modified-generated-layer'
  | 'unverified-generation'
  | 'missing-generation'
  | 'modified-generation'
  | 'missing-timeline-membership'

export interface RigidBakeOwnershipIssue {
  readonly kind: RigidBakeOwnershipIssueKind
  readonly target: string
  readonly message: string
}

export interface RigidBakeOwnershipInspection {
  readonly record: RigidBakeRecord
  readonly mode: 'rigid' | 'fracture'
  readonly ownershipState: RigidBakeOwnershipState
  readonly sourceState: RigidBakeSourceState
  readonly issues: readonly RigidBakeOwnershipIssue[]
  readonly generation?: AnyFractureGeneration
  readonly generations?: readonly AnyFractureGeneration[]
  readonly canSafelyMutate: boolean
}

/**
 * Inspects persisted bake ownership against the current scene without mutation.
 *
 * Track and generated-layer hashes distinguish user edits from untouched bake
 * output. Missing or duplicate targets are incomplete ownership rather than
 * edits because a destructive command cannot identify one authoritative item.
 * Source provenance is reported independently: a changed source may be cleared
 * safely when owned output is intact, but an old recipe cannot be replayed as a
 * current preview. Instances are stateless and share no mutable data.
 */
export class RigidBakeOwnershipInspector {
  inspect(scene: ChronoScene, recordId: string): RigidBakeOwnershipInspection {
    const record = scene.physics?.rigidBakes.find(candidate => candidate.id === recordId)
    if (!record) throw new Error(`Rigid bake record does not exist: ${recordId}`)
    const fracture = !!record.recipe.fractureEvents?.length
    const issues: RigidBakeOwnershipIssue[] = []
    const timeline = scene.timelines.find(candidate => candidate.id === record.recipe.timelineId)
    if (!timeline) {
      issues.push(issue('missing-timeline', record.recipe.timelineId, 'The bake timeline no longer exists.'))
    } else {
      for (const owned of record.tracks) {
        const matches = timeline.tracks.filter(track => track.target === owned.target)
        if (!matches.length) issues.push(issue('missing-track', owned.target, 'A generated track is missing.'))
        else if (matches.length > 1) issues.push(issue('duplicate-track', owned.target, 'More than one track now writes this generated target.'))
        else if (hashRigidBakeTrack(matches[0]) !== owned.contentHash) {
          issues.push(issue('modified-track', owned.target, 'A generated track was edited after baking.'))
        }
      }
      for (const layerId of record.timelineLayerIdsAdded ?? []) {
        if (!timeline.layerIds?.includes(layerId)) {
          issues.push(issue('missing-timeline-membership', layerId, 'A bake-owned timeline membership is missing.'))
        }
      }
    }

    let generation: AnyFractureGeneration | undefined
    let generations: readonly AnyFractureGeneration[] | undefined
    if (fracture) {
      if (!record.generatedLayers) {
        issues.push(issue('unverified-generated-layers', record.id, 'This legacy bake has no generated-layer hashes.'))
      } else {
        for (const owned of record.generatedLayers) {
          const matches = scene.layers.filter(layer => layer.id === owned.layerId)
          if (!matches.length) issues.push(issue('missing-generated-layer', owned.layerId, 'A generated fragment layer is missing.'))
          else if (matches.length > 1) issues.push(issue('duplicate-generated-layer', owned.layerId, 'A generated fragment layer id is duplicated.'))
          else if (hashRigidBakeGeneratedLayer(matches[0]) !== owned.contentHash) {
            issues.push(issue('modified-generated-layer', owned.layerId, 'A generated fragment layer was edited after baking.'))
          }
        }
      }
      generations = resolveFractureGenerations(scene, record)
      generation = resolveFractureGeneration(scene, record)
      const ownedGenerations = record.fractureGenerations ?? (record.fractureGeneration ? [record.fractureGeneration] : [])
      if (!ownedGenerations.length) {
        issues.push(issue('unverified-generation', record.id, 'This legacy bake has no explicit topology ownership.'))
      } else {
        ownedGenerations.forEach(owned => {
          const current = generations?.find(candidate => candidate.generationId === owned.generationId)
          if (!current) {
            issues.push(issue('missing-generation', owned.generationId, 'The fracture topology manifest is missing.'))
          } else if (current.topologyHash !== owned.topologyHash) {
            issues.push(issue('modified-generation', current.generationId, 'The fracture topology manifest no longer matches the bake.'))
          }
        })
      }
    }

    const ownershipState = classifyOwnership(issues)
    return Object.freeze({
      record,
      mode: fracture ? 'fracture' : 'rigid',
      ownershipState,
      sourceState: inspectSourceState(scene, record, generation),
      issues: Object.freeze(issues),
      ...(generation ? { generation } : {}),
      ...(generations?.length ? { generations: Object.freeze([...generations]) } : {}),
      canSafelyMutate: issues.length === 0,
    })
  }
}

/** Build one portable ownership record from already validated generated data. */
export function createRigidBakeRecord(input: {
  readonly id: string
  readonly recipe: RigidBodyBakeRecipe
  readonly sampleCount: number
  readonly tracks: readonly Track[]
  readonly generatedLayers?: readonly Layer[]
  readonly generation?: AnyFractureGeneration
  readonly generations?: readonly AnyFractureGeneration[]
  readonly timelineLayerIdsAdded?: readonly string[]
}): RigidBakeRecord {
  return Object.freeze({
    schemaVersion: 1,
    id: input.id,
    recipe: input.recipe,
    sampleCount: input.sampleCount,
    tracks: Object.freeze(input.tracks.map(track => Object.freeze({
      target: track.target,
      contentHash: hashRigidBakeTrack(track),
    }))),
    ...(input.generatedLayers ? {
      generatedLayers: Object.freeze(input.generatedLayers.map(layer => Object.freeze({
        layerId: layer.id,
        contentHash: hashRigidBakeGeneratedLayer(layer),
      }))),
    } : {}),
    ...((input.generations?.[0] ?? input.generation) ? {
      fractureGeneration: Object.freeze({
        generationId: (input.generations?.[0] ?? input.generation)!.generationId,
        topologyHash: (input.generations?.[0] ?? input.generation)!.topologyHash,
      }),
    } : {}),
    ...(input.generations && input.generations.length > 1 ? {
      fractureGenerations: Object.freeze(input.generations.map(generation => Object.freeze({
        generationId: generation.generationId,
        topologyHash: generation.topologyHash,
      }))),
    } : {}),
    ...(input.timelineLayerIdsAdded ? {
      timelineLayerIdsAdded: Object.freeze([...input.timelineLayerIdsAdded]),
    } : {}),
  })
}

/** Hash every portable field of a generated fragment layer independent of key order. */
export function hashRigidBakeGeneratedLayer(layer: Layer): string {
  return hashCanonicalRecords('rigid-bake-generated-layer-v1', [canonicalJson(layer)])
}

/** Resolve topology for new records and exact-fragment legacy records. */
export function resolveFractureGeneration(
  scene: ChronoScene,
  record: RigidBakeRecord,
): AnyFractureGeneration | undefined {
  const generations = scene.physics?.fractureGenerations ?? []
  if (record.fractureGeneration) {
    return generations.find(generation => generation.generationId === record.fractureGeneration!.generationId)
  }
  const fragmentIds = new Set(record.recipe.bodies.filter(body => body.activation).map(body => body.layerId))
  const sourceBodyId = record.recipe.fractureEvents?.[0]?.sourceBodyId
  const sourceLayerId = record.recipe.bodies.find(body => body.bodyId === sourceBodyId)?.layerId
  return generations.find(generation => generation.source.ownerId === sourceLayerId
    && generation.fragments.length === fragmentIds.size
    && generation.fragments.every(fragment => fragmentIds.has(fragment.id)))
}

/** Resolve every explicitly owned recursive topology in stored order. */
export function resolveFractureGenerations(
  scene: ChronoScene,
  record: RigidBakeRecord,
): readonly AnyFractureGeneration[] {
  if (record.fractureGenerations?.length) {
    return record.fractureGenerations.flatMap(owned => {
      const generation = scene.physics?.fractureGenerations?.find(candidate => (
        candidate.generationId === owned.generationId
      ))
      return generation ? [generation] : []
    })
  }
  const root = resolveFractureGeneration(scene, record)
  return root ? [root] : []
}

function inspectSourceState(
  scene: ChronoScene,
  record: RigidBakeRecord,
  generation: AnyFractureGeneration | undefined,
): RigidBakeSourceState {
  const recipe = record.recipe
  const ownedTargets = new Set(record.tracks.map(track => track.target))
  const sourceScene: ChronoScene = {
    ...scene,
    timelines: scene.timelines.map(timeline => timeline.id === recipe.timelineId
      ? { ...timeline, tracks: timeline.tracks.filter(track => !ownedTargets.has(track.target)) }
      : timeline),
  }
  try {
    if (recipe.fractureEvents?.length) {
      if (!generation) return 'unavailable'
      const generations = resolveFractureGenerations(scene, record)
      if (recipe.fractureHierarchy) {
        return new FractureRecursiveRecipeCompiler().isCurrent(recipe, generations, sourceScene) ? 'current' : 'changed'
      }
      return new FractureRigidRecipeCompiler().isCurrent(recipe, generation, sourceScene) ? 'current' : 'changed'
    }
    return new RigidBodySceneCompiler().isCurrent(recipe, sourceScene) ? 'current' : 'changed'
  } catch {
    return 'unavailable'
  }
}

function classifyOwnership(issues: readonly RigidBakeOwnershipIssue[]): RigidBakeOwnershipState {
  if (issues.some(item => item.kind.startsWith('missing-') || item.kind.startsWith('duplicate-'))) return 'incomplete'
  if (issues.some(item => item.kind.startsWith('modified-'))) return 'edited'
  if (issues.some(item => item.kind.startsWith('unverified-'))) return 'legacy'
  return 'current'
}

function issue(kind: RigidBakeOwnershipIssueKind, target: string, message: string): RigidBakeOwnershipIssue {
  return Object.freeze({ kind, target, message })
}
