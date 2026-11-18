import { MatterPhysicsBackend } from '@/lib/physics/MatterPhysicsBackend'
import type { PhysicsBackendFactory } from '@/lib/physics/PhysicsBackend'
import { RigidPoseClip } from '@/lib/physics/RigidPoseClip'
import { RigidPoseTrackCompiler } from '@/lib/physics/RigidPoseTrackCompiler'
import { assertRigidFractureEvents } from '@/lib/physics/RigidFractureValidation'
import { hashRigidBodyBakeRecipe, hashRigidBodySource } from '@/lib/physics/RigidBodySceneCompiler'
import { editorResourceBudget, type ResourceAllocator, type ResourceReservation } from '@/lib/resources/budget'
import { cancelledJobError } from '@/lib/resources/jobs'
import { SimulationClock } from '@/lib/simulation/SimulationClock'
import type { Track } from '@/lib/types'
import type { RigidBodyBakeRecipe, RigidPoseCacheHeader } from '@/lib/types/physics'
import type { BakeAdapter, BakePreparationContext } from '../BakeContracts'

const DEFAULT_MAX_RETAINED_BYTES = 64 * 1024 ** 2
const PREVIEW_OVERHEAD_BYTES = 64 * 1024
const ESTIMATED_KEY_BYTES = 144
const ESTIMATED_TRACK_BYTES = 256

export interface RigidBodyBakeReport {
  readonly tickCount: number
  readonly sampleCount: number
  readonly bodyCount: number
  readonly dynamicBodyCount: number
  readonly keyframeCount: number
  readonly clipBytes: number
  readonly estimatedTrackBytes: number
  readonly retainedBytes: number
  readonly solver: 'matter-js@0.20.0'
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
  readonly maxRetainedBytes?: number
  /** Cooperative main-thread slice size until the dedicated worker lands. */
  readonly yieldEveryTicks?: number
}

/**
 * Runs one deterministic fixed-step rigid simulation and prepares normal tracks.
 *
 * Solver state is private to the injected backend and always disposed. Work
 * observes AbortSignal on every tick and yields at a bounded interval so the UI
 * can cancel. No scene mutation occurs; publication remains BakeService's one
 * synchronous commit transaction.
 */
export class RigidBodyBakeAdapter implements BakeAdapter<RigidBodyBakeRecipe, RigidBodyBakePreview> {
  readonly kind = 'rigidPose'
  private readonly allocator: ResourceAllocator
  private readonly backendFactory: PhysicsBackendFactory
  private readonly maxRetainedBytes: number
  private readonly yieldEveryTicks: number
  private readonly trackCompiler = new RigidPoseTrackCompiler()

  constructor(options: RigidBodyBakeAdapterOptions = {}) {
    this.allocator = options.allocator ?? editorResourceBudget
    this.backendFactory = options.backendFactory ?? (() => new MatterPhysicsBackend())
    this.maxRetainedBytes = options.maxRetainedBytes ?? DEFAULT_MAX_RETAINED_BYTES
    this.yieldEveryTicks = options.yieldEveryTicks ?? 64
    if (!Number.isSafeInteger(this.maxRetainedBytes) || this.maxRetainedBytes < 1) throw new RangeError('Rigid preview byte limit is invalid')
    if (!Number.isSafeInteger(this.yieldEveryTicks) || this.yieldEveryTicks < 1) throw new RangeError('Rigid bake yield interval is invalid')
  }

  /** Prepares an owned pose clip and editable tracks without touching the scene. */
  async prepare(recipe: RigidBodyBakeRecipe, context: BakePreparationContext): Promise<RigidBodyBakePreview> {
    this.validateRecipe(recipe)
    const clock = new SimulationClock(recipe)
    const dynamicCount = recipe.bodies.filter(body => body.motionType === 'dynamic').length
    const poseValues = safeProduct(clock.sampleCount, recipe.bodies.length, 3)
    const visibilityKeyframeCount = (recipe.fractureEvents ?? [])
      .reduce((count, event) => count + (event.fragmentBodyIds.length + 1) * 2, 0)
    const keyframeCount = safeAdd(safeProduct(clock.sampleCount, dynamicCount, 3), visibilityKeyframeCount)
    const posePayloadBytes = safeAdd(safeProduct(poseValues, Float64Array.BYTES_PER_ELEMENT), safeProduct(clock.sampleCount, Float64Array.BYTES_PER_ELEMENT))
    const trackCount = dynamicCount * 3 + (recipe.fractureEvents ?? [])
      .reduce((count, event) => count + event.fragmentBodyIds.length + 1, 0)
    const estimatedTrackBytes = safeAdd(safeProduct(keyframeCount, ESTIMATED_KEY_BYTES), safeProduct(trackCount, ESTIMATED_TRACK_BYTES))
    const retainedEstimate = safeAdd(posePayloadBytes, estimatedTrackBytes)
    if (retainedEstimate > this.maxRetainedBytes) throw new RangeError(`Rigid bake preview exceeds ${this.maxRetainedBytes} retained bytes`)
    checkCancelled(context.signal)
    const peakBytes = safeAdd(safeProduct(posePayloadBytes, 2), estimatedTrackBytes, PREVIEW_OVERHEAD_BYTES)
    const reservation = this.allocator.reserve('preview', peakBytes)
    if (!reservation) throw new RangeError('Rigid bake preview exceeds the managed resource budget')
    const backend = this.backendFactory()
    let poses = new Float64Array(poseValues)
    let times = clock.sampleTimesMs()
    try {
      if (backend.id !== recipe.solverId || backend.version !== recipe.solverVersion) {
        throw new Error('Rigid physics backend does not match the recipe')
      }
      backend.initialize(recipe)
      writeSample(poses, 0, recipe, backend)
      context.reportProgress({ value: .05, phase: 'simulate', message: 'Rigid solver initialized.' })
      for (let tick = 1; tick <= clock.totalTicks; tick++) {
        checkCancelled(context.signal)
        backend.step(clock.stepDurationMs)
        if (clock.isSampleTick(tick)) writeSample(poses, clock.sampleIndexForTick(tick), recipe, backend)
        if (tick % this.yieldEveryTicks === 0 || tick === clock.totalTicks) {
          context.reportProgress({
            value: .05 + .7 * tick / clock.totalTicks,
            phase: 'simulate', message: `Simulated ${tick} / ${clock.totalTicks} fixed ticks.`,
          })
          await yieldToHost()
        }
      }
      checkCancelled(context.signal)
      const header: RigidPoseCacheHeader = {
        schemaVersion: 1, kind: 'rigidPose', solverId: recipe.solverId, solverVersion: recipe.solverVersion,
        sourceHash: String(recipe.source.revision), recipeHash: recipe.recipeHash,
        coordinateSpace: 'composition-pixels-y-down', linearUnit: 'pixel', angularUnit: 'degree-unwrapped',
        timeUnit: 'millisecond', pixelsPerMeter: recipe.pixelsPerMeter, stepHz: recipe.stepHz,
        sampleFps: recipe.sampleFps, durationMs: recipe.durationMs,
        bodyIds: recipe.bodies.map(body => body.bodyId), channels: ['centerX', 'centerY', 'angle'],
      }
      context.reportProgress({ value: .8, phase: 'compile', message: 'Compiling normal transform tracks.' })
      const clip = new RigidPoseClip({ header, sampleTimesMs: times, poses })
      poses = new Float64Array(0); times = new Float64Array(0)
      const tracks = this.trackCompiler.compile(recipe, clip)
      checkCancelled(context.signal)
      const retainedBytes = safeAdd(clip.byteLength, estimatedTrackBytes)
      if (!reservation.resize(retainedBytes)) throw new RangeError('Rigid retained preview exceeds the managed resource budget')
      reservation.commit()
      const report: RigidBodyBakeReport = {
        tickCount: clock.totalTicks, sampleCount: clock.sampleCount, bodyCount: recipe.bodies.length,
        dynamicBodyCount: dynamicCount, keyframeCount, clipBytes: clip.byteLength, estimatedTrackBytes,
        retainedBytes, solver: 'matter-js@0.20.0', recipeHash: recipe.recipeHash,
      }
      context.reportProgress({ value: .95, phase: 'preview', message: 'Rigid pose preview and editable tracks are ready.' })
      return new RigidBodyBakePreview({ recipe, report, clip, tracks, reservation })
    } catch (error) {
      reservation.release()
      throw error
    } finally {
      backend.dispose()
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

function writeSample(
  target: Float64Array,
  sampleIndex: number,
  recipe: RigidBodyBakeRecipe,
  backend: ReturnType<PhysicsBackendFactory>,
): void {
  recipe.bodies.forEach((body, bodyIndex) => {
    const pose = backend.readPose(body.bodyId), offset = (sampleIndex * recipe.bodies.length + bodyIndex) * 3
    if (![pose.centerX, pose.centerY, pose.angleDeg].every(Number.isFinite)) throw new RangeError(`Rigid solver produced a non-finite pose for ${body.bodyId}`)
    target[offset] = pose.centerX; target[offset + 1] = pose.centerY; target[offset + 2] = pose.angleDeg
  })
}

function checkCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw cancelledJobError()
}

function yieldToHost(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
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
