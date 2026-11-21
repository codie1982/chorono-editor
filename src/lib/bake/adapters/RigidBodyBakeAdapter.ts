import type { PhysicsBackendFactory } from '@/lib/physics/PhysicsBackend'
import { RigidPoseClip } from '@/lib/physics/RigidPoseClip'
import { RigidPoseTrackCompiler } from '@/lib/physics/RigidPoseTrackCompiler'
import type { RigidPoseSimplificationPolicy } from '@/lib/physics/RigidPoseKeyframeSimplifier'
import { assertRigidFractureEvents } from '@/lib/physics/RigidFractureValidation'
import { hashRigidBodyBakeRecipe, hashRigidBodySource } from '@/lib/physics/RigidBodySceneCompiler'
import { editorResourceBudget, type ResourceAllocator, type ResourceReservation } from '@/lib/resources/budget'
import { cancelledJobError } from '@/lib/resources/jobs'
import { SimulationClock } from '@/lib/simulation/SimulationClock'
import type { Track } from '@/lib/types'
import type { RigidBodyBakeRecipe, RigidPoseCacheHeader } from '@/lib/types/physics'
import type { BakeAdapter, BakePreparationContext } from '../BakeContracts'
import type { RigidBodySimulationExecutor } from '../rigid/RigidBodySimulationExecutor'
import { RigidBodySimulationRunner } from '../rigid/RigidBodySimulationRunner'
import { RigidBodyWorkerClient } from '../rigid/RigidBodyWorkerClient'
import { realizeRigidFractureRecipe } from '@/lib/physics/RigidFractureRecipeRealizer'

const DEFAULT_MAX_RETAINED_BYTES = 64 * 1024 ** 2
const PREVIEW_OVERHEAD_BYTES = 64 * 1024
const ESTIMATED_KEY_BYTES = 144
const ESTIMATED_TRACK_BYTES = 256

export interface RigidBodyBakeReport {
  readonly tickCount: number
  readonly sampleCount: number
  readonly bodyCount: number
  readonly dynamicBodyCount: number
  readonly rawKeyframeCount: number
  readonly keyframeCount: number
  readonly protectedEventCount: number
  readonly clusterCount: number
  readonly bondCount: number
  readonly bondBreakCount: number
  readonly clusterSplitCount: number
  readonly maxVertexErrorPx: number
  readonly maxAngleErrorDeg: number
  readonly clipBytes: number
  readonly estimatedTrackBytes: number
  readonly retainedBytes: number
  readonly solver: 'matter-js@0.20.0'
  readonly execution: 'inline' | 'worker'
  readonly recipeHash: string
}

/** Owns dense preview data, generated tracks and their managed budget charge. */
export class RigidBodyBakePreview {
  readonly recipe: RigidBodyBakeRecipe
  readonly report: RigidBodyBakeReport
  private clipValue: RigidPoseClip | undefined
  private tracksValue: readonly Track[] | undefined
  private reservation: ResourceReservation | undefined

  constructor(input: {
    recipe: RigidBodyBakeRecipe
    report: RigidBodyBakeReport
    clip: RigidPoseClip
    tracks: readonly Track[]
    reservation: ResourceReservation
  }) {
    this.recipe = input.recipe
    this.report = input.report
    this.clipValue = input.clip
    this.tracksValue = input.tracks
    this.reservation = input.reservation
  }

  /** Borrows the immutable dense pose clip while this preview remains live. */
  get clip(): RigidPoseClip {
    if (!this.clipValue) throw new Error('Rigid body bake preview was released')
    return this.clipValue
  }

  /** Borrows generated normal tracks; callers must not mutate them. */
  get tracks(): readonly Track[] {
    if (!this.tracksValue) throw new Error('Rigid body bake preview was released')
    return this.tracksValue
  }

  /** Idempotently drops retained references after releasing the budget ticket. */
  release(): void {
    this.reservation?.release()
    this.reservation = undefined
    this.clipValue = undefined
    this.tracksValue = undefined
  }
}

export interface RigidBodyBakeAdapterOptions {
  readonly allocator?: ResourceAllocator
  readonly backendFactory?: PhysicsBackendFactory
  /** Explicit execution policy; omit to prefer Worker in supported browsers. */
  readonly simulationExecutor?: RigidBodySimulationExecutor
  readonly maxRetainedBytes?: number
  /** Cooperative compatibility-fallback slice size. */
  readonly yieldEveryTicks?: number
  /** Coupled world-space pose simplification; defaults to 0.5 px / 0.25°. */
  readonly simplificationPolicy?: RigidPoseSimplificationPolicy
}

/**
 * Runs one deterministic fixed-step rigid simulation and prepares normal tracks.
 *
 * Browsers prefer a dedicated Worker; unsupported platforms retain the same
 * deterministic bounded-yield runner. Solver state is always disposed and
 * work observes AbortSignal. No scene mutation occurs; publication remains
 * BakeService's one synchronous commit transaction.
 */
export class RigidBodyBakeAdapter implements BakeAdapter<RigidBodyBakeRecipe, RigidBodyBakePreview> {
  readonly kind = 'rigidPose'
  private readonly allocator: ResourceAllocator
  private readonly simulationExecutor: RigidBodySimulationExecutor
  private readonly maxRetainedBytes: number
  private readonly yieldEveryTicks: number
  private readonly trackCompiler: RigidPoseTrackCompiler

  constructor(options: RigidBodyBakeAdapterOptions = {}) {
    this.allocator = options.allocator ?? editorResourceBudget
    this.maxRetainedBytes = options.maxRetainedBytes ?? DEFAULT_MAX_RETAINED_BYTES
    this.yieldEveryTicks = options.yieldEveryTicks ?? 64
    if (!Number.isSafeInteger(this.maxRetainedBytes) || this.maxRetainedBytes < 1) throw new RangeError('Rigid preview byte limit is invalid')
    if (!Number.isSafeInteger(this.yieldEveryTicks) || this.yieldEveryTicks < 1) throw new RangeError('Rigid bake yield interval is invalid')
    if (options.simulationExecutor && options.backendFactory) {
      throw new Error('Rigid simulation executor and backend factory are mutually exclusive')
    }
    this.simulationExecutor = options.simulationExecutor ?? (
      !options.backendFactory && options.yieldEveryTicks === undefined && RigidBodyWorkerClient.isSupported()
        ? new RigidBodyWorkerClient()
        : new RigidBodySimulationRunner({ backendFactory: options.backendFactory, yieldEveryTicks: this.yieldEveryTicks })
    )
    this.trackCompiler = new RigidPoseTrackCompiler(options.simplificationPolicy)
  }

  /** Prepares an owned pose clip and editable tracks without touching the scene. */
  async prepare(recipe: RigidBodyBakeRecipe, context: BakePreparationContext): Promise<RigidBodyBakePreview> {
    this.validateRecipe(recipe)
    const clock = new SimulationClock(recipe)
    const dynamicCount = recipe.bodies.filter(body => body.motionType === 'dynamic').length
    const poseValues = safeProduct(clock.sampleCount, recipe.bodies.length, 3)
    const visibilityKeyframeCount = (recipe.fractureEvents ?? [])
      .reduce((count, event) => count + (event.fragmentBodyIds.length + 1) * 2, 0)
    const rawKeyframeCount = safeAdd(safeProduct(clock.sampleCount, dynamicCount, 3), visibilityKeyframeCount)
    const posePayloadBytes = safeAdd(safeProduct(poseValues, Float64Array.BYTES_PER_ELEMENT), safeProduct(clock.sampleCount, Float64Array.BYTES_PER_ELEMENT))
    const trackCount = dynamicCount * 3 + (recipe.fractureEvents ?? [])
      .reduce((count, event) => count + event.fragmentBodyIds.length + 1, 0)
    const worstCaseTrackBytes = safeAdd(safeProduct(rawKeyframeCount, ESTIMATED_KEY_BYTES), safeProduct(trackCount, ESTIMATED_TRACK_BYTES))
    const retainedEstimate = safeAdd(posePayloadBytes, worstCaseTrackBytes)
    if (retainedEstimate > this.maxRetainedBytes) throw new RangeError(`Rigid bake preview exceeds ${this.maxRetainedBytes} retained bytes`)
    checkCancelled(context.signal)
    const peakBytes = safeAdd(safeProduct(posePayloadBytes, 2), worstCaseTrackBytes, PREVIEW_OVERHEAD_BYTES)
    const reservation = this.allocator.reserve('preview', peakBytes)
    if (!reservation) throw new RangeError('Rigid bake preview exceeds the managed resource budget')
    try {
      context.reportProgress({ value: .05, phase: 'simulate', message: 'Rigid solver initialized.' })
      const simulation = await this.simulationExecutor.simulate(recipe, {
        signal: context.signal,
        reportProgress: ({ tick, totalTicks }) => context.reportProgress({
          value: .05 + .7 * tick / totalTicks,
          phase: 'simulate',
          message: `Simulated ${tick} / ${totalTicks} fixed ticks.`,
        }),
      })
      checkCancelled(context.signal)
      const realizedRecipe = realizeRigidFractureRecipe(recipe, simulation.events)
      const header: RigidPoseCacheHeader = {
        schemaVersion: 1, kind: 'rigidPose', solverId: realizedRecipe.solverId, solverVersion: realizedRecipe.solverVersion,
        sourceHash: String(realizedRecipe.source.revision), recipeHash: realizedRecipe.recipeHash,
        coordinateSpace: 'composition-pixels-y-down', linearUnit: 'pixel', angularUnit: 'degree-unwrapped',
        timeUnit: 'millisecond', pixelsPerMeter: realizedRecipe.pixelsPerMeter, stepHz: realizedRecipe.stepHz,
        sampleFps: realizedRecipe.sampleFps, durationMs: realizedRecipe.durationMs,
        bodyIds: realizedRecipe.bodies.map(body => body.bodyId), channels: ['centerX', 'centerY', 'angle'],
      }
      context.reportProgress({ value: .8, phase: 'compile', message: 'Compiling normal transform tracks.' })
      const clip = new RigidPoseClip({
        header,
        sampleTimesMs: simulation.sampleTimesMs,
        poses: simulation.poses,
      })
      const compilation = this.trackCompiler.compile(realizedRecipe, clip, simulation.events)
      const tracks = compilation.tracks
      checkCancelled(context.signal)
      const estimatedTrackBytes = safeAdd(
        safeProduct(compilation.report.keyframeCount, ESTIMATED_KEY_BYTES),
        safeProduct(trackCount, ESTIMATED_TRACK_BYTES),
      )
      const retainedBytes = safeAdd(clip.byteLength, estimatedTrackBytes)
      if (!reservation.resize(retainedBytes)) throw new RangeError('Rigid retained preview exceeds the managed resource budget')
      reservation.commit()
      const report: RigidBodyBakeReport = {
        tickCount: clock.totalTicks, sampleCount: clock.sampleCount, bodyCount: recipe.bodies.length,
        dynamicBodyCount: dynamicCount, rawKeyframeCount: compilation.report.rawKeyframeCount,
        keyframeCount: compilation.report.keyframeCount,
        protectedEventCount: compilation.report.protectedEventCount,
        clusterCount: realizedRecipe.fractureClusters?.length ?? 0,
        bondCount: realizedRecipe.fractureClusters?.reduce((sum, cluster) => sum + cluster.graph.bonds.length, 0) ?? 0,
        bondBreakCount: simulation.events.filter(event => event.kind === 'bond-break').length,
        clusterSplitCount: simulation.events.filter(event => event.kind === 'bond-break'
          && (event.bondBreak?.componentIds.length ?? 0) > 1).length,
        maxVertexErrorPx: compilation.report.maxVertexErrorPx,
        maxAngleErrorDeg: compilation.report.maxAngleErrorDeg,
        clipBytes: clip.byteLength, estimatedTrackBytes,
        retainedBytes, solver: 'matter-js@0.20.0', execution: simulation.execution, recipeHash: realizedRecipe.recipeHash,
      }
      context.reportProgress({ value: .95, phase: 'preview', message: 'Rigid pose preview and editable tracks are ready.' })
      return new RigidBodyBakePreview({ recipe: realizedRecipe, report, clip, tracks, reservation })
    } catch (error) {
      reservation.release()
      throw error
    }
  }

  private validateRecipe(recipe: RigidBodyBakeRecipe): void {
    if (recipe.kind !== this.kind || recipe.version !== 1) throw new Error('Rigid body bake recipe version is unsupported')
    if (recipe.source.kind !== 'rigidScene' || recipe.source.ownerId !== recipe.timelineId) throw new Error('Rigid body bake source identity is invalid')
    const { recipeHash, ...withoutHash } = recipe
    if (hashRigidBodyBakeRecipe(withoutHash) !== recipeHash) throw new Error('Rigid body bake recipe hash is stale')
    if (hashRigidBodySource(recipe.timelineId, recipe.bodies) !== recipe.source.revision) throw new Error('Rigid body bake source hash is stale')
    if (!recipe.bodies.length || !recipe.bodies.some(body => body.motionType === 'dynamic')) throw new Error('Rigid body bake requires dynamic bodies')
    if (new Set(recipe.bodies.map(body => body.bodyId)).size !== recipe.bodies.length) throw new Error('Rigid body ids must be unique')
    assertRigidFractureEvents(recipe)
  }
}

function checkCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw cancelledJobError()
}

function safeProduct(...values: number[]): number {
  const result = values.reduce((product, value) => product * value, 1)
  if (!Number.isSafeInteger(result) || result < 1) throw new RangeError('Rigid bake dimensions exceed supported limits')
  return result
}

function safeAdd(...values: number[]): number {
  const result = values.reduce((sum, value) => sum + value, 0)
  if (!Number.isSafeInteger(result) || result < 1) throw new RangeError('Rigid bake byte size exceeds supported limits')
  return result
}
