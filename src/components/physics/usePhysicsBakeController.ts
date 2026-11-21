'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import {
  BakeService,
  RigidBodyBakeAdapter,
  type BakeJobHandle,
  type BakeJobSnapshot,
  type RigidBodyBakePreview,
} from '@/lib/bake'
import { makeClearRigidBakeCmd } from '@/lib/editor/commands-rigid-bake-lifecycle'
import { makeApplyRigidBodyBakeCmd, makeReplaceRigidBodyBakeCmd } from '@/lib/editor/commands-rigid-body-bake'
import { makeApplyVoronoiFractureBakeCmd, makeReplaceVoronoiFractureBakeCmd } from '@/lib/editor/commands-voronoi-fracture-bake'
import { FractureRigidRecipeCompiler } from '@/lib/fracture/FractureRigidRecipeCompiler'
import {
  PhysicsBakeRecipeFactory,
  type RigidBakeRecipeInput,
  type VoronoiBakeRecipeInput,
} from '@/lib/physics/PhysicsBakeRecipeFactory'
import { RigidBodySceneCompiler } from '@/lib/physics/RigidBodySceneCompiler'
import { RigidBakeOwnershipInspector, type RigidBakeOwnershipInspection } from '@/lib/physics/RigidBakeOwnership'
import { clearRigidBakeOwnedContent, type RigidBakeConflictPolicy } from '@/lib/physics/RigidBakeSceneMutation'
import type { AnyFractureGeneration } from '@/lib/types/fracture'
import type { RigidBakeRecord } from '@/lib/types/physics'

export type PhysicsBakeRequest =
  | { readonly mode: 'rigid'; readonly input: RigidBakeRecipeInput; readonly recordId?: string; readonly replaceRecordId?: string }
  | { readonly mode: 'fracture'; readonly input: VoronoiBakeRecipeInput; readonly recordId?: string; readonly replaceRecordId?: string }

export interface PhysicsBakeDescriptor {
  readonly mode: PhysicsBakeRequest['mode']
  readonly sourceLayerId: string
  readonly timelineId: string
  readonly startTimeMs: number
  readonly durationMs: number
  readonly replacingRecordId?: string
}

export interface PhysicsBakeController {
  readonly snapshot: BakeJobSnapshot<RigidBodyBakePreview> | null
  readonly descriptor: PhysicsBakeDescriptor | null
  start(request: PhysicsBakeRequest): void
  startRebake(recordId: string): void
  cancel(): void
  discard(): void
  checkSource(): boolean
  inspectBake(recordId: string): RigidBakeOwnershipInspection
  clearBake(recordId: string, conflictPolicy?: RigidBakeConflictPolicy): void
  commit(conflictPolicy?: RigidBakeConflictPolicy): Promise<void>
}

interface PreparedJob {
  readonly mode: PhysicsBakeRequest['mode']
  readonly generation?: AnyFractureGeneration
  readonly recordId?: string
  readonly replaceRecordId?: string
}

/**
 * Owns the editor-wide first-slice rigid/fracture preview job.
 *
 * The hook is mounted by the workspace, not an individual dock tab, so a
 * running Worker survives panel switches and the Physics and Jobs & Bake views
 * observe the same snapshot. It keeps dense clips out of React scene state,
 * rechecks source provenance before commit and publishes through one existing
 * undoable editor command. Unmount/document replacement cancels and releases
 * all unpublished resources.
 */
export function usePhysicsBakeController(editor: EditorStateReturn): PhysicsBakeController {
  const service = useRef<BakeService>()
  const job = useRef<BakeJobHandle<RigidBodyBakePreview> | null>(null)
  const prepared = useRef<PreparedJob | null>(null)
  const unsubscribe = useRef<(() => void) | null>(null)
  const [snapshot, setSnapshot] = useState<BakeJobSnapshot<RigidBodyBakePreview> | null>(null)
  const [descriptor, setDescriptor] = useState<PhysicsBakeDescriptor | null>(null)
  const getScene = editor.getScene
  const getDocumentSignal = editor.getDocumentSignal
  const isTransactionActive = editor.isTransactionActive
  const dispatchCommand = editor.dispatchCommand

  const discard = useCallback(() => {
    unsubscribe.current?.()
    unsubscribe.current = null
    job.current?.dispose()
    job.current = null
    prepared.current = null
    setSnapshot(null)
    setDescriptor(null)
  }, [])

  useEffect(() => () => {
    unsubscribe.current?.()
    unsubscribe.current = null
    service.current?.dispose()
    service.current = undefined
    job.current = null
    prepared.current = null
  }, [])

  const start = useCallback((request: PhysicsBakeRequest) => {
    if (isTransactionActive()) throw new Error('Finish the active canvas gesture before preparing a physics preview.')
    const liveScene = getScene()
    const scene = request.replaceRecordId
      ? clearRigidBakeOwnedContent(liveScene, request.replaceRecordId, 'discard-edits')
      : liveScene
    const factory = new PhysicsBakeRecipeFactory()
    const compiled = request.mode === 'rigid'
      ? { recipe: factory.compileRigid(scene, request.input), generation: undefined }
      : factory.compileVoronoi(scene, request.input)
    const recipe = compiled.recipe
    const generation = compiled.generation
    const documentSignal = getDocumentSignal()

    discard()
    const adapter = new RigidBodyBakeAdapter()
    service.current ??= new BakeService({ concurrency: 1, maxQueued: 4 })
    const next = service.current.createJob<RigidBodyBakePreview>({
      kind: adapter.kind,
      label: request.mode === 'fracture' ? `Voronoi fracture · ${request.input.sourceLayerId}` : 'Rigid body simulation',
      source: recipe.source,
      documentSignal,
      isSourceCurrent: () => {
        if (getDocumentSignal() !== documentSignal || documentSignal.aborted) return false
        const liveCurrent = getScene()
        let current = liveCurrent
        try {
          if (request.replaceRecordId) {
            current = clearRigidBakeOwnedContent(liveCurrent, request.replaceRecordId, 'discard-edits')
          }
        } catch {
          return false
        }
        return request.mode === 'fracture' && generation
          ? new FractureRigidRecipeCompiler().isCurrent(recipe, generation, current)
          : new RigidBodySceneCompiler().isCurrent(recipe, current)
      },
      prepare: context => adapter.prepare(recipe, context),
      discardPreview: preview => preview.release(),
    })
    prepared.current = {
      mode: request.mode,
      generation,
      recordId: request.recordId,
      replaceRecordId: request.replaceRecordId,
    }
    const sourceLayerId = request.mode === 'fracture'
      ? request.input.sourceLayerId
      : request.input.bodies.find(body => body.motionType === 'dynamic')?.layerId ?? 'dynamic body'
    setDescriptor({
      mode: request.mode,
      sourceLayerId,
      timelineId: request.input.timelineId,
      startTimeMs: request.input.startTimeMs ?? 0,
      durationMs: request.input.durationMs,
      ...(request.replaceRecordId ? { replacingRecordId: request.replaceRecordId } : {}),
    })
    job.current = next
    setSnapshot(next.getSnapshot())
    unsubscribe.current = next.subscribe(() => setSnapshot(next.getSnapshot()))
    void next.start()
  }, [discard, getDocumentSignal, getScene, isTransactionActive])

  const cancel = useCallback(() => job.current?.cancel(), [])
  const checkSource = useCallback(() => job.current?.checkSource() ?? true, [])

  const inspectBake = useCallback((recordId: string) => (
    new RigidBakeOwnershipInspector().inspect(getScene(), recordId)
  ), [getScene])

  const startRebake = useCallback((recordId: string) => {
    const inspection = new RigidBakeOwnershipInspector().inspect(getScene(), recordId)
    start(requestFromRecord(inspection.record, inspection.generation))
  }, [getScene, start])

  const clearBake = useCallback((recordId: string, conflictPolicy?: RigidBakeConflictPolicy) => {
    if (isTransactionActive()) throw new Error('Finish the active canvas gesture before clearing this bake.')
    if (prepared.current?.replaceRecordId === recordId) discard()
    dispatchCommand(makeClearRigidBakeCmd({ recordId, conflictPolicy }))
  }, [discard, dispatchCommand, isTransactionActive])

  const commit = useCallback(async (conflictPolicy: RigidBakeConflictPolicy = 'reject') => {
    const active = job.current
    const pending = prepared.current
    if (!active || !pending) throw new Error('Physics preview is not ready to apply.')
    if (isTransactionActive()) throw new Error('Finish the active canvas gesture before applying this bake.')
    await active.commit(preview => {
      if (pending.mode === 'fracture') {
        if (!pending.generation) throw new Error('Fracture generation is missing from the prepared preview.')
        dispatchCommand(pending.replaceRecordId ? makeReplaceVoronoiFractureBakeCmd({
          existingRecordId: pending.replaceRecordId,
          generation: pending.generation,
          recipe: preview.recipe,
          tracks: preview.tracks,
          sampleCount: preview.report.sampleCount,
          conflictPolicy,
        }) : makeApplyVoronoiFractureBakeCmd({
          generation: pending.generation,
          recipe: preview.recipe,
          tracks: preview.tracks,
          sampleCount: preview.report.sampleCount,
          recordId: pending.recordId,
        }))
        return
      }
      dispatchCommand(pending.replaceRecordId ? makeReplaceRigidBodyBakeCmd({
        existingRecordId: pending.replaceRecordId,
        recipe: preview.recipe,
        tracks: preview.tracks,
        sampleCount: preview.report.sampleCount,
        conflictPolicy,
      }) : makeApplyRigidBodyBakeCmd({
        recipe: preview.recipe,
        tracks: preview.tracks,
        sampleCount: preview.report.sampleCount,
        recordId: pending.recordId,
      }))
    })
  }, [dispatchCommand, isTransactionActive])

  return {
    snapshot,
    descriptor,
    start,
    startRebake,
    cancel,
    discard,
    checkSource,
    inspectBake,
    clearBake,
    commit,
  }
}

/**
 * Reconstructs product authoring inputs from one persisted recipe.
 *
 * The result requests replacement of the same ownership record but does not
 * mutate or reuse its generated tracks. Fracture requires the realized
 * topology manifest to recover seed/count/generation identity. All units and
 * fixed-step settings remain identical until the user changes the draft.
 */
export function requestFromRecord(
  record: RigidBakeRecord,
  generation?: AnyFractureGeneration,
): PhysicsBakeRequest {
  const recipe = record.recipe
  const common = {
    timelineId: recipe.timelineId,
    startTimeMs: recipe.startTimeMs,
    durationMs: recipe.durationMs,
    stepHz: recipe.stepHz,
    sampleFps: recipe.sampleFps,
    pixelsPerMeter: recipe.pixelsPerMeter,
    gravity: { ...recipe.gravityMetersPerSecondSquared },
  }
  if (!recipe.fractureEvents?.length) {
    return {
      mode: 'rigid',
      replaceRecordId: record.id,
      input: {
        ...common,
        bodies: recipe.bodies.map(body => ({
          layerId: body.layerId,
          motionType: body.motionType,
          material: { ...body.material },
          initialVelocityPxPerSecond: { ...body.initialVelocityPxPerSecond },
          initialAngularVelocityDegPerSecond: body.initialAngularVelocityDegPerSecond,
        })),
      },
    }
  }
  if (!generation) throw new Error('The fracture topology manifest is unavailable; clear or repair this bake first.')
  const event = recipe.fractureEvents[0]
  const source = recipe.bodies.find(body => body.bodyId === event.sourceBodyId)
  if (!source) throw new Error('The fracture source body is missing from its recipe.')
  const fractureTrigger = event.trigger?.kind === 'impact'
    ? {
      kind: 'impact' as const,
      minimumRelativeNormalSpeedPxPerSecond: event.trigger.minimumRelativeNormalSpeedPxPerSecond,
      colliderLayerIds: event.trigger.colliderBodyIds.map(bodyId => {
        const collider = recipe.bodies.find(body => body.bodyId === bodyId)
        if (!collider) throw new Error(`The impact collider is missing from its recipe: ${bodyId}`)
        return collider.layerId
      }),
    }
    : { kind: 'time' as const }
  return {
    mode: 'fracture',
    replaceRecordId: record.id,
    input: {
      ...common,
      sourceLayerId: source.layerId,
      staticLayerIds: recipe.bodies.filter(body => body.motionType === 'static').map(body => body.layerId),
      fractureTimeMs: fractureTrigger.kind === 'time' ? event.timeMs : undefined,
      fractureTrigger,
      explosion: event.explosion ? {
        ...event.explosion,
        centerLocalOffsetPx: { ...event.explosion.centerLocalOffsetPx },
      } : undefined,
      cluster: recipe.fractureClusters?.[0] ? {
        graphId: recipe.fractureClusters[0].graph.graphId,
        defaults: { ...recipe.fractureClusters[0].graph.defaults },
        overrides: recipe.fractureClusters[0].graph.overrides.map(override => ({ ...override })),
      } : undefined,
      fragmentCount: generation.requestedFragmentCount,
      seed: generation.rootSeed,
      generationId: generation.generationId,
      material: { ...source.material },
      initialVelocityPxPerSecond: { ...source.initialVelocityPxPerSecond },
      initialAngularVelocityDegPerSecond: source.initialAngularVelocityDegPerSecond,
    },
  }
}
