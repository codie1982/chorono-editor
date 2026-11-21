import {
  RigidBodyBakeAdapter,
  type RigidBodyBakePreview,
  type RigidBodyBakeReport,
} from '@/lib/bake/adapters/RigidBodyBakeAdapter'
import { makeApplyRigidBodyBakeCmd, makeReplaceRigidBodyBakeCmd } from '@/lib/editor/commands-rigid-body-bake'
import { makeApplyVoronoiFractureBakeCmd, makeReplaceVoronoiFractureBakeCmd } from '@/lib/editor/commands-voronoi-fracture-bake'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import { FractureRigidRecipeCompiler } from '@/lib/fracture/FractureRigidRecipeCompiler'
import { PhysicsBakeRecipeFactory } from '@/lib/physics/PhysicsBakeRecipeFactory'
import { RigidBodySceneCompiler } from '@/lib/physics/RigidBodySceneCompiler'
import { clearRigidBakeOwnedContent, type RigidBakeConflictPolicy } from '@/lib/physics/RigidBakeSceneMutation'
import type { ChronoScene } from '@/lib/types'
import type { AnyFractureGeneration } from '@/lib/types/fracture'
import type { RigidBodyBakeRecipe, RigidBodyMaterial, RigidFractureExplosion } from '@/lib/types/physics'
import type { BakePreparationContext } from '@/lib/bake/BakeContracts'

export interface MCPRigidBodyInput {
  readonly layerId: string
  readonly motionType: 'dynamic' | 'static'
  readonly material?: Partial<RigidBodyMaterial>
  readonly initialVelocityPxPerSecond?: { readonly x?: number; readonly y?: number }
  readonly initialAngularVelocityDegPerSecond?: number
}

export interface MCPRigidBakeInput {
  readonly timelineId: string
  readonly startTimeMs?: number
  readonly durationMs: number
  readonly stepHz?: number
  readonly sampleFps?: number
  readonly pixelsPerMeter?: number
  readonly gravity?: { readonly x?: number; readonly y?: number }
  readonly bodies: readonly MCPRigidBodyInput[]
  readonly recordId?: string
  readonly replaceRecordId?: string
  readonly replaceEdited?: boolean
}

export interface MCPVoronoiBakeInput {
  readonly sourceLayerId: string
  readonly staticLayerIds?: readonly string[]
  readonly timelineId: string
  readonly startTimeMs?: number
  readonly durationMs: number
  readonly fractureTimeMs?: number
  readonly fractureTrigger?:
    | { readonly kind: 'time' }
    | {
      readonly kind: 'impact'
      readonly minimumRelativeNormalSpeedPxPerSecond: number
      readonly colliderLayerIds?: readonly string[]
    }
  readonly explosion?: RigidFractureExplosion
  readonly fragmentCount: number
  readonly seed: number
  readonly generationId: string
  readonly recordId?: string
  readonly replaceRecordId?: string
  readonly replaceEdited?: boolean
  readonly stepHz?: number
  readonly sampleFps?: number
  readonly pixelsPerMeter?: number
  readonly gravity?: { readonly x?: number; readonly y?: number }
  readonly material?: Partial<RigidBodyMaterial>
  readonly initialVelocityPxPerSecond?: { readonly x?: number; readonly y?: number }
  readonly initialAngularVelocityDegPerSecond?: number
}

export interface MCPBakeResult {
  readonly scene: ChronoScene
  readonly report: RigidBodyBakeReport
  readonly recipeHash: string
  readonly generationId?: string
  readonly fragmentCount?: number
}

/**
 * Immutable compilation result shared by direct MCP bake calls and persistent
 * preview jobs.
 *
 * It owns no Worker, buffer or scene state. The caller supplies a prepared
 * preview to `createCommand`, then publishes that command through the editor's
 * normal source-authorization boundary. `isSourceCurrent` checks only the
 * geometry/topology and target channels used by this recipe, so unrelated
 * scene edits do not invalidate a reviewed preview.
 */
export interface MCPPhysicsBakeDefinition {
  readonly mode: 'rigid' | 'fracture'
  readonly label: string
  readonly sourceLayerId: string
  readonly recipe: RigidBodyBakeRecipe
  readonly generation?: AnyFractureGeneration
  readonly recordId?: string
  readonly replaceRecordId?: string
  readonly defaultConflictPolicy: RigidBakeConflictPolicy
  isSourceCurrent(scene: ChronoScene): boolean
  createCommand(preview: RigidBodyBakePreview, conflictPolicy?: RigidBakeConflictPolicy): EditorCommand
}

/** Compile a rigid-body request without starting a solver or mutating source. */
export function compileMCPRigidBake(scene: ChronoScene, input: MCPRigidBakeInput): MCPPhysicsBakeDefinition {
  assertReplacementInput(input)
  const sourceScene = replacementSource(scene, input.replaceRecordId)
  const recipe = new PhysicsBakeRecipeFactory().compileRigid(sourceScene, input)
  const sourceLayerId = input.bodies.find(body => body.motionType === 'dynamic')?.layerId
  if (!sourceLayerId) throw new Error('Rigid body bake requires a dynamic source layer')
  return {
    mode: 'rigid',
    label: `Rigid body simulation · ${sourceLayerId}`,
    sourceLayerId,
    recipe,
    recordId: input.recordId,
    replaceRecordId: input.replaceRecordId,
    defaultConflictPolicy: input.replaceEdited ? 'discard-edits' : 'reject',
    isSourceCurrent: current => {
      try {
        return new RigidBodySceneCompiler().isCurrent(recipe, replacementSource(current, input.replaceRecordId))
      } catch { return false }
    },
    createCommand: (preview, conflictPolicy = input.replaceEdited ? 'discard-edits' : 'reject') => input.replaceRecordId
      ? makeReplaceRigidBodyBakeCmd({
        existingRecordId: input.replaceRecordId,
        recipe: preview.recipe,
        tracks: preview.tracks,
        sampleCount: preview.report.sampleCount,
        conflictPolicy,
      })
      : makeApplyRigidBodyBakeCmd({
      recipe: preview.recipe,
      tracks: preview.tracks,
      sampleCount: preview.report.sampleCount,
      recordId: input.recordId,
    }),
  }
}

/** Compile deterministic Voronoi topology and its rigid recipe without work. */
export function compileMCPVoronoiBake(scene: ChronoScene, input: MCPVoronoiBakeInput): MCPPhysicsBakeDefinition {
  assertReplacementInput(input)
  const sourceScene = replacementSource(scene, input.replaceRecordId)
  const { recipe, generation } = new PhysicsBakeRecipeFactory().compileVoronoi(sourceScene, input)
  return {
    mode: 'fracture',
    label: `Voronoi fracture · ${input.sourceLayerId}`,
    sourceLayerId: input.sourceLayerId,
    recipe,
    generation,
    recordId: input.recordId,
    replaceRecordId: input.replaceRecordId,
    defaultConflictPolicy: input.replaceEdited ? 'discard-edits' : 'reject',
    isSourceCurrent: current => {
      try {
        return new FractureRigidRecipeCompiler().isCurrent(recipe, generation, replacementSource(current, input.replaceRecordId))
      } catch { return false }
    },
    createCommand: (preview, conflictPolicy = input.replaceEdited ? 'discard-edits' : 'reject') => input.replaceRecordId
      ? makeReplaceVoronoiFractureBakeCmd({
        existingRecordId: input.replaceRecordId,
        generation,
        recipe: preview.recipe,
        tracks: preview.tracks,
        sampleCount: preview.report.sampleCount,
        conflictPolicy,
      })
      : makeApplyVoronoiFractureBakeCmd({
      generation,
      recipe: preview.recipe,
      tracks: preview.tracks,
      sampleCount: preview.report.sampleCount,
      recordId: input.recordId,
    }),
  }
}

/**
 * Prepare and atomically apply a deterministic rigid-body bake.
 *
 * The adapter owns Matter.js and dense preview buffers only until the command
 * has copied ordinary tracks into the returned immutable scene. Cancellation
 * is cooperative; the caller still performs the final revision check before
 * publishing that scene to the editor.
 */
export async function prepareMCPRigidBake(
  scene: ChronoScene,
  input: MCPRigidBakeInput,
  signal?: AbortSignal,
): Promise<MCPBakeResult> {
  return prepareAndApply(scene, compileMCPRigidBake(scene, input), signal)
}

/**
 * Generate one rectangle Voronoi topology, simulate its one-shot fracture and
 * atomically publish fragment layers, normal tracks and provenance records.
 */
export async function prepareMCPVoronoiBake(
  scene: ChronoScene,
  input: MCPVoronoiBakeInput,
  signal?: AbortSignal,
): Promise<MCPBakeResult> {
  return prepareAndApply(scene, compileMCPVoronoiBake(scene, input), signal)
}

/** Execute one compiled definition and publish it into a detached scene value. */
async function prepareAndApply(
  scene: ChronoScene,
  definition: MCPPhysicsBakeDefinition,
  signal?: AbortSignal,
): Promise<MCPBakeResult> {
  const adapter = new RigidBodyBakeAdapter()
  const preview = await adapter.prepare(definition.recipe, preparationContext(signal))
  try {
    const generation = definition.generation
    return {
      scene: definition.createCommand(preview, definition.defaultConflictPolicy).execute(scene),
      report: preview.report,
      recipeHash: preview.recipe.recipeHash,
      ...(generation ? {
        generationId: generation.generationId,
        fragmentCount: generation.fragments.length,
      } : {}),
    }
  } finally {
    preview.release()
  }
}

function replacementSource(scene: ChronoScene, recordId: string | undefined): ChronoScene {
  return recordId ? clearRigidBakeOwnedContent(scene, recordId, 'discard-edits') : scene
}

function assertReplacementInput(input: { readonly recordId?: string; readonly replaceRecordId?: string }): void {
  if (input.recordId && input.replaceRecordId) {
    throw new Error('recordId cannot be combined with replaceRecordId; replacement keeps the existing record id')
  }
}

/** Create the adapter context without exposing transient progress as scene data. */
function preparationContext(signal?: AbortSignal): BakePreparationContext {
  return {
    signal: signal ?? new AbortController().signal,
    reportProgress: () => {},
  }
}
