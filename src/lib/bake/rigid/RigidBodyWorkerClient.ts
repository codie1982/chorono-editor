import { cancelledJobError } from '@/lib/resources/jobs'
import { SimulationClock } from '@/lib/simulation/SimulationClock'
import type { RigidBodyBakeRecipe } from '@/lib/types/physics'
import type { RigidBodySolverEvent, RigidBodySolverEventKind } from '@/lib/physics/PhysicsBackend'
import { compareRigidBodyIds } from '@/lib/physics/RigidBodyEventOrdering'
import type {
  RigidBodySimulationContext,
  RigidBodySimulationExecutor,
  RigidBodySimulationResult,
} from './RigidBodySimulationExecutor'
import type { RigidBodyWorkerHandle, RigidBodyWorkerReply } from './RigidBodyWorkerProtocol'

const DEFAULT_TIMEOUT_MS = 120000

export class RigidBodyWorkerUnavailable extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RigidBodyWorkerUnavailable'
  }
}

export interface RigidBodyWorkerClientOptions {
  readonly createWorker?: () => RigidBodyWorkerHandle
  readonly timeoutMs?: number
}

/**
 * One-shot worker transport for a rigid simulation recipe.
 *
 * A readiness handshake precedes work. Abort requests are cooperative after
 * simulation starts, so the client retains the worker until cleanup is
 * acknowledged or the deadline terminates it. Result ArrayBuffers transfer
 * without a second dense JSON/structured-clone copy. All exits detach the
 * timer, abort listener and Worker callbacks exactly once.
 */
export class RigidBodyWorkerClient implements RigidBodySimulationExecutor {
  readonly execution = 'worker' as const
  private readonly createWorker: () => RigidBodyWorkerHandle
  private readonly timeoutMs: number

  constructor(options: RigidBodyWorkerClientOptions = {}) {
    this.createWorker = options.createWorker
      ?? (() => new Worker(new URL('../workers/rigidBodySimulation.worker.ts', import.meta.url)))
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs <= 0 || this.timeoutMs > 0x7fffffff) {
      throw new RangeError('Invalid rigid worker deadline')
    }
  }

  static isSupported(): boolean {
    return typeof Worker !== 'undefined'
  }

  async simulate(
    recipe: RigidBodyBakeRecipe,
    context: RigidBodySimulationContext,
  ): Promise<RigidBodySimulationResult> {
    if (context.signal.aborted) throw cancelledJobError()
    let worker: RigidBodyWorkerHandle
    try {
      worker = this.createWorker()
    } catch (error) {
      throw new RigidBodyWorkerUnavailable(`Rigid worker setup failed: ${String(error)}`)
    }
    const clock = new SimulationClock(recipe)
    const expectedPoseValues = clock.sampleCount * recipe.bodies.length * 3
    return new Promise((resolve, reject) => {
      let finished = false
      let started = false
      const finish = (error?: Error, result?: RigidBodySimulationResult) => {
        if (finished) return
        finished = true
        clearTimeout(timer)
        context.signal.removeEventListener('abort', abort)
        worker.onmessage = null
        worker.onerror = null
        worker.onmessageerror = null
        worker.terminate()
        if (context.signal.aborted) reject(cancelledJobError())
        else if (error) reject(error)
        else resolve(result!)
      }
      const abort = () => {
        if (!started) {
          finish(cancelledJobError())
          return
        }
        try {
          worker.postMessage({ kind: 'cancel' })
        } catch (error) {
          finish(asError(error))
        }
      }
      const timer = setTimeout(() => {
        const error = new Error('Rigid simulation worker timed out.')
        error.name = 'TimeoutError'
        finish(error)
      }, this.timeoutMs)
      worker.onmessage = (event: MessageEvent<RigidBodyWorkerReply>) => {
        if (finished) return
        const message = event.data
        if (!message || typeof message.kind !== 'string') {
          finish(new Error('Invalid rigid worker response.'))
          return
        }
        if (message.kind === 'ready') {
          if (started) {
            finish(new Error('Duplicate rigid worker ready message.'))
          } else if (!message.supported) {
            finish(new RigidBodyWorkerUnavailable('Rigid simulation worker is unavailable.'))
          } else if (context.signal.aborted) {
            abort()
          } else {
            try {
              worker.postMessage({ kind: 'simulate', recipe })
              started = true
            } catch (error) {
              finish(asError(error))
            }
          }
        } else if (message.kind === 'progress') {
          if (!started || !validProgress(message.tick, message.totalTicks, clock.totalTicks)) {
            finish(new Error('Invalid rigid worker progress.'))
          } else {
            context.reportProgress({ tick: message.tick, totalTicks: message.totalTicks })
          }
        } else if (message.kind === 'result') {
          if (!started) {
            finish(new Error('Rigid worker returned output before input.'))
            return
          }
          try {
            const sampleTimesMs = new Float64Array(message.sampleTimesBuffer)
            const poses = new Float64Array(message.posesBuffer)
            if (sampleTimesMs.length !== clock.sampleCount || poses.length !== expectedPoseValues) {
              throw new Error('Rigid worker output dimensions do not match the recipe.')
            }
            const events = validateEvents(message.events, recipe, clock)
            finish(undefined, { execution: this.execution, sampleTimesMs, poses, events })
          } catch (error) {
            finish(asError(error))
          }
        } else if (message.kind === 'error') {
          const error = new Error(message.message)
          error.name = message.name
          finish(error)
        }
      }
      worker.onerror = event => finish(started
        ? new Error(event.message || 'Rigid simulation worker failed.')
        : new RigidBodyWorkerUnavailable(event.message || 'Rigid worker setup failed.'))
      worker.onmessageerror = () => finish(new Error('Rigid worker message could not be decoded.'))
      context.signal.addEventListener('abort', abort, { once: true })
      if (context.signal.aborted) abort()
    })
  }
}

const EVENT_KINDS = new Set<RigidBodySolverEventKind>([
  'contact-start', 'contact-end', 'sleep-start', 'sleep-end', 'fracture',
  'bond-break',
])

/** Treat Worker event metadata as untrusted structured-clone input. */
function validateEvents(
  value: readonly RigidBodySolverEvent[],
  recipe: RigidBodyBakeRecipe,
  clock: SimulationClock,
): readonly RigidBodySolverEvent[] {
  if (!Array.isArray(value) || value.length > 100_000) throw new Error('Rigid worker event payload is invalid.')
  const knownBodies = new Set(recipe.bodies.map(body => body.bodyId))
  let previousTick = 0
  return Object.freeze(value.map(event => {
    if (!event || !EVENT_KINDS.has(event.kind) || !Number.isSafeInteger(event.tick)
      || event.tick < previousTick || event.tick < 1 || event.tick > clock.totalTicks
      || !Number.isFinite(event.timeMs) || Math.abs(clock.timeMsForTick(event.tick) - event.timeMs) > 1e-6
      || !Array.isArray(event.bodyIds) || event.bodyIds.length < 1 || event.bodyIds.length > 2
      || new Set(event.bodyIds).size !== event.bodyIds.length
      || event.bodyIds.some((bodyId: unknown) => typeof bodyId !== 'string' || !knownBodies.has(bodyId))) {
      throw new Error('Rigid worker event payload is invalid.')
    }
    if (event.kind.startsWith('contact-') && event.bodyIds.length !== 2) {
      throw new Error('Rigid worker event payload is invalid.')
    }
    if (event.kind.startsWith('sleep-') && event.bodyIds.length !== 1) {
      throw new Error('Rigid worker event payload is invalid.')
    }
    if (event.kind === 'bond-break' && (event.bodyIds.length !== 2 || !validBondBreakEvidence(event, recipe))) {
      throw new Error('Rigid worker event payload is invalid.')
    }
    if (event.kind !== 'fracture' && event.fracture) throw new Error('Rigid worker event payload is invalid.')
    if (event.kind !== 'bond-break' && event.bondBreak) throw new Error('Rigid worker event payload is invalid.')
    if (event.kind === 'fracture' && !validFractureEvidence(event, recipe)) {
      throw new Error('Rigid worker event payload is invalid.')
    }
    if (event.bodyIds.length === 2 && compareRigidBodyIds(event.bodyIds[0], event.bodyIds[1]) > 0) {
      throw new Error('Rigid worker event payload is invalid.')
    }
    previousTick = event.tick
    return Object.freeze({
      ...event,
      bodyIds: Object.freeze([...event.bodyIds]),
      ...(event.fracture ? { fracture: Object.freeze({
        ...event.fracture,
        ...(event.fracture.contactPointPx ? { contactPointPx: Object.freeze({ ...event.fracture.contactPointPx }) } : {}),
        ...(event.fracture.contactNormal ? { contactNormal: Object.freeze({ ...event.fracture.contactNormal }) } : {}),
      }) } : {}),
      ...(event.bondBreak ? { bondBreak: Object.freeze({
        ...event.bondBreak,
        componentIds: Object.freeze([...event.bondBreak.componentIds]),
      }) } : {}),
    })
  }))
}

function validBondBreakEvidence(event: RigidBodySolverEvent, recipe: RigidBodyBakeRecipe): boolean {
  const evidence = event.bondBreak
  const cluster = recipe.fractureClusters?.find(candidate => candidate.graph.graphId === evidence?.graphId)
  const bond = cluster?.graph.bonds.find(candidate => candidate.bondId === evidence?.bondId)
  if (!evidence || !bond || !['impulse', 'damage', 'forced'].includes(evidence.reason)
    || !Number.isFinite(evidence.load) || evidence.load < 0
    || !Number.isFinite(evidence.accumulatedDamage) || evidence.accumulatedDamage < 0
    || !Array.isArray(evidence.componentIds) || !evidence.componentIds.length
    || evidence.componentIds.some(id => typeof id !== 'string' || !id)) return false
  const expectedBodyIds = [bond.fragmentAId, bond.fragmentBId].map(layerId => (
    recipe.bodies.find(body => body.layerId === layerId)?.bodyId
  )).sort()
  return JSON.stringify(event.bodyIds) === JSON.stringify(expectedBodyIds)
}

function validFractureEvidence(event: RigidBodySolverEvent, recipe: RigidBodyBakeRecipe): boolean {
  const evidence = event.fracture
  const fracture = recipe.fractureEvents?.find(item => item.id === evidence?.eventId)
  if (!evidence || !fracture || evidence.triggerKind !== (fracture.trigger?.kind ?? 'time')) return false
  if (evidence.triggerKind === 'time') {
    return event.bodyIds.length === 1 && event.bodyIds[0] === fracture.sourceBodyId
      && evidence.contactBodyId === undefined && evidence.relativeNormalSpeedPxPerSecond === undefined
      && evidence.contactPointPx === undefined && evidence.contactNormal === undefined
  }
  return event.bodyIds.length === 2
    && evidence.contactBodyId !== undefined
    && fracture.trigger?.kind === 'impact'
    && fracture.trigger.colliderBodyIds.includes(evidence.contactBodyId)
    && event.bodyIds.includes(fracture.sourceBodyId)
    && event.bodyIds.includes(evidence.contactBodyId)
    && Number.isFinite(evidence.relativeNormalSpeedPxPerSecond)
    && evidence.relativeNormalSpeedPxPerSecond! >= fracture.trigger.minimumRelativeNormalSpeedPxPerSecond
    && finitePoint(evidence.contactPointPx)
    && finitePoint(evidence.contactNormal)
}

function finitePoint(value: { readonly x: number; readonly y: number } | undefined): boolean {
  return !!value && Number.isFinite(value.x) && Number.isFinite(value.y)
}

function validProgress(tick: number, totalTicks: number, expectedTicks: number): boolean {
  return Number.isSafeInteger(tick) && Number.isSafeInteger(totalTicks)
    && totalTicks === expectedTicks && tick >= 0 && tick <= totalTicks
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
