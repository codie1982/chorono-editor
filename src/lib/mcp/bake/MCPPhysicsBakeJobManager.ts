import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import {
  BakeService,
  RigidBodyBakeAdapter,
  type BakeJobHandle,
  type BakeJobProgress,
  type BakeJobStatus,
  type RigidBodyBakePreview,
  type RigidBodyBakeReport,
} from '@/lib/bake'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import type { ChronoScene } from '@/lib/types'
import type { RigidBodySnapshot } from '@/lib/types/physics'
import type { RigidBakeConflictPolicy } from '@/lib/physics/RigidBakeSceneMutation'
import { RigidBakeOwnershipInspector, type RigidBakeOwnershipInspection } from '@/lib/physics/RigidBakeOwnership'
import { isRigidBodyVisibleAtTime } from '@/lib/physics/RigidPoseTrackCompiler'
import {
  compileMCPRigidBake,
  compileMCPVoronoiBake,
  type MCPPhysicsBakeDefinition,
  type MCPRigidBakeInput,
  type MCPVoronoiBakeInput,
} from './MCPRigidBake'

const MAX_JOBS = 32
const TERMINAL_TTL_MS = 10 * 60 * 1000

type EditorBakeHost = Pick<EditorStateReturn,
  'getScene' | 'getRevision' | 'getDocumentSignal' | 'isTransactionActive' | 'subscribeCommitted'>

/** Serializable status returned to MCP callers and observed by the Jobs dock. */
export interface MCPPhysicsBakeJobSnapshot {
  readonly jobId: string
  readonly mode: MCPPhysicsBakeDefinition['mode']
  readonly label: string
  readonly sourceLayerId: string
  readonly timelineId: string
  readonly sourceRevision: string | number
  readonly documentRevisionAtStart: number
  readonly status: BakeJobStatus
  readonly progress: BakeJobProgress
  readonly createdAtMs: number
  readonly updatedAtMs: number
  readonly report?: RigidBodyBakeReport
  readonly recipeHash: string
  readonly generationId?: string
  readonly fragmentCount?: number
  readonly generationCount?: number
  readonly totalFragmentCount?: number
  readonly replaceRecordId?: string
  readonly error?: string
}

/** One sampled, non-persistent cache frame for an MCP preview request. */
export interface MCPPhysicsBakePreviewFrame {
  readonly jobId: string
  readonly timeMs: number
  readonly absoluteTimeMs: number
  readonly durationMs: number
  readonly event?: { readonly timeMs: number; readonly tick: number }
  readonly events?: readonly { readonly eventId: string; readonly timeMs: number; readonly tick: number }[]
  readonly bodies: readonly {
    readonly bodyId: string
    readonly layerId: string
    readonly motionType: RigidBodySnapshot['motionType']
    readonly visible: boolean
    readonly centerX: number
    readonly centerY: number
    readonly angleDeg: number
    readonly widthPx: number
    readonly heightPx: number
    readonly colliderVerticesPx?: RigidBodySnapshot['colliderVerticesPx']
    readonly colliderPartsPx?: RigidBodySnapshot['colliderPartsPx']
  }[]
}

/** Borrowed UI inspection data; consumers must not retain it after discard. */
export interface MCPPhysicsBakeInspection {
  readonly scene: ChronoScene
  readonly preview: RigidBodyBakePreview
}

interface JobEntry {
  readonly jobId: string
  readonly definition: MCPPhysicsBakeDefinition
  readonly sourceScene: ChronoScene
  readonly documentRevisionAtStart: number
  readonly documentSignal: AbortSignal
  readonly host: EditorBakeHost
  readonly handle: BakeJobHandle<RigidBodyBakePreview>
  readonly createdAtMs: number
  updatedAtMs: number
  report?: RigidBodyBakeReport
  unsubscribe?: () => void
  unsubscribeSource?: () => void
}

export interface MCPPhysicsBakeJobManagerOptions {
  readonly service?: BakeService
  readonly idFactory?: () => string
  readonly clock?: () => number
}

/**
 * Owns persistent, preview-first MCP physics jobs inside one editor tab.
 *
 * Jobs survive individual MCP request completion and expose status, cancel,
 * sampled preview, commit and discard operations. Dense clips and Worker state
 * remain outside scene/history. Source replacement aborts the job through the
 * editor document signal; commit still passes through a caller-supplied normal
 * editor command boundary. Instances hold mutable runtime state and must be
 * disposed with their editor tab.
 */
export class MCPPhysicsBakeJobManager {
  private readonly service: BakeService
  private readonly ownsService: boolean
  private readonly idFactory: () => string
  private readonly clock: () => number
  private readonly entries = new Map<string, JobEntry>()
  private readonly listeners = new Set<() => void>()
  private listCache: readonly MCPPhysicsBakeJobSnapshot[] = []

  constructor(options: MCPPhysicsBakeJobManagerOptions = {}) {
    this.service = options.service ?? new BakeService({ concurrency: 1, maxQueued: 8 })
    this.ownsService = options.service === undefined
    this.idFactory = options.idFactory ?? randomJobId
    this.clock = options.clock ?? Date.now
  }

  /** Start a rigid preview and return immediately with its persistent id. */
  startRigid(host: EditorBakeHost, input: MCPRigidBakeInput): MCPPhysicsBakeJobSnapshot {
    return this.start(host, compileMCPRigidBake(host.getScene(), input))
  }

  /** Start a Voronoi preview and return immediately with its persistent id. */
  startVoronoi(host: EditorBakeHost, input: MCPVoronoiBakeInput): MCPPhysicsBakeJobSnapshot {
    return this.start(host, compileMCPVoronoiBake(host.getScene(), input))
  }

  /** Read current status, rechecking the prepared source before reporting it. */
  status(jobId: string): MCPPhysicsBakeJobSnapshot {
    const entry = this.require(jobId)
    entry.handle.checkSource()
    this.refresh(entry)
    return this.snapshot(entry)
  }

  /** Cooperatively cancel queued/running work while retaining its final status. */
  cancel(jobId: string): MCPPhysicsBakeJobSnapshot {
    const entry = this.require(jobId)
    entry.handle.cancel()
    this.refresh(entry)
    return this.snapshot(entry)
  }

  /** Sample retained dense preview data without modifying playback or source. */
  preview(jobId: string, requestedTimeMs?: number): MCPPhysicsBakePreviewFrame {
    const entry = this.require(jobId)
    entry.handle.checkSource()
    const snapshot = entry.handle.getSnapshot()
    if (snapshot.status !== 'preview-ready' || !snapshot.preview) {
      throw new Error(`Bake preview is not ready; current status is ${snapshot.status}`)
    }
    const preview = snapshot.preview
    const event = preview.recipe.fractureEvents?.[0]
    const events = preview.recipe.fractureEvents ?? []
    const defaultTime = event?.timeMs ?? Math.min(1000, preview.recipe.durationMs)
    const timeMs = clampTime(requestedTimeMs ?? defaultTime, preview.recipe.durationMs)
    return {
      jobId,
      timeMs,
      absoluteTimeMs: preview.recipe.startTimeMs + timeMs,
      durationMs: preview.recipe.durationMs,
      ...(event ? { event: { timeMs: event.timeMs, tick: event.tick } } : {}),
      ...(events.length ? { events: events.map(item => ({
        eventId: item.id, timeMs: item.timeMs, tick: item.tick,
      })) } : {}),
      bodies: preview.recipe.bodies.map(body => {
        const pose = preview.clip.sample(body.bodyId, timeMs)
        return {
          bodyId: body.bodyId,
          layerId: body.layerId,
          motionType: body.motionType,
          visible: isRigidBodyVisibleAtTime(preview.recipe, body.bodyId, timeMs),
          centerX: pose.centerX,
          centerY: pose.centerY,
          angleDeg: pose.angleDeg,
          widthPx: body.widthPx,
          heightPx: body.heightPx,
          ...(body.colliderVerticesPx ? { colliderVerticesPx: body.colliderVerticesPx } : {}),
          ...(body.colliderPartsPx ? { colliderPartsPx: body.colliderPartsPx } : {}),
        }
      }),
    }
  }

  /**
   * Publish a reviewed preview through one synchronous caller-owned command.
   * The caller is responsible for source authorization and authoring stamps.
   */
  async commit(
    jobId: string,
    publish: (command: EditorCommand) => void,
    conflictPolicy: RigidBakeConflictPolicy = 'reject',
  ): Promise<MCPPhysicsBakeJobSnapshot> {
    const entry = this.require(jobId)
    if (entry.host.isTransactionActive()) throw new Error('Finish the active editor transaction before committing a bake')
    await entry.handle.commit(preview => publish(entry.definition.createCommand(preview, conflictPolicy)))
    this.refresh(entry)
    return this.snapshot(entry)
  }

  /** Release unpublished buffers and remove the job from status/history lists. */
  discard(jobId: string): MCPPhysicsBakeJobSnapshot {
    const entry = this.require(jobId)
    const snapshot = this.snapshot(entry)
    entry.unsubscribe?.()
    entry.unsubscribeSource?.()
    entry.handle.dispose()
    this.entries.delete(jobId)
    this.emit()
    return snapshot
  }

  /** Read all tab-local jobs newest first using a stable external-store value. */
  getSnapshots = (): readonly MCPPhysicsBakeJobSnapshot[] => this.listCache

  /** Observe job list/status changes; unsubscribe is idempotent. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Borrow a ready preview for the editor UI only. */
  inspect(jobId: string): MCPPhysicsBakeInspection | undefined {
    const entry = this.entries.get(jobId)
    const preview = entry?.handle.getSnapshot().preview
    return entry && preview ? { scene: entry.sourceScene, preview } : undefined
  }

  /** Read replacement ownership for human review; undefined for new bakes. */
  inspectReplacement(jobId: string): RigidBakeOwnershipInspection | undefined {
    const entry = this.require(jobId)
    const recordId = entry.definition.replaceRecordId
    if (!recordId) return undefined
    try { return new RigidBakeOwnershipInspector().inspect(entry.host.getScene(), recordId) }
    catch { return undefined }
  }

  /** Human UI commit path; normal editor dispatch records it as a human edit. */
  commitFromUI(
    jobId: string,
    editor: Pick<EditorStateReturn, 'dispatchCommand'>,
    conflictPolicy?: RigidBakeConflictPolicy,
  ): Promise<MCPPhysicsBakeJobSnapshot> {
    return this.commit(jobId, command => editor.dispatchCommand(command), conflictPolicy)
  }

  /** Cooperatively cancel every remote job when the MCP bridge disconnects. */
  cancelAll(): void {
    for (const entry of Array.from(this.entries.values())) entry.handle.cancel()
  }

  /** Release every job and the owned queue on editor teardown. */
  dispose(): void {
    for (const entry of Array.from(this.entries.values())) {
      entry.unsubscribe?.()
      entry.unsubscribeSource?.()
      entry.handle.dispose()
    }
    this.entries.clear()
    this.listCache = []
    this.listeners.clear()
    if (this.ownsService) this.service.dispose()
  }

  private start(host: EditorBakeHost, definition: MCPPhysicsBakeDefinition): MCPPhysicsBakeJobSnapshot {
    if (host.isTransactionActive()) throw new Error('Finish the active editor transaction before preparing a bake')
    this.prune()
    if (this.entries.size >= MAX_JOBS) throw new Error(`At most ${MAX_JOBS} retained bake jobs are supported; discard finished jobs`)
    const jobId = this.uniqueId()
    const sourceScene = host.getScene()
    const documentSignal = host.getDocumentSignal()
    const adapter = new RigidBodyBakeAdapter()
    let entry!: JobEntry
    const handle = this.service.createJob<RigidBodyBakePreview>({
      kind: adapter.kind,
      label: definition.label,
      source: definition.recipe.source,
      documentSignal,
      isSourceCurrent: () => host.getDocumentSignal() === documentSignal
        && !documentSignal.aborted
        && definition.isSourceCurrent(host.getScene()),
      prepare: context => adapter.prepare(definition.recipe, context),
      discardPreview: preview => preview.release(),
    })
    const now = this.clock()
    entry = {
      jobId,
      definition,
      sourceScene,
      documentRevisionAtStart: host.getRevision(),
      documentSignal,
      host,
      handle,
      createdAtMs: now,
      updatedAtMs: now,
    }
    entry.unsubscribe = handle.subscribe(() => this.refresh(entry))
    entry.unsubscribeSource = host.subscribeCommitted(() => {
      const status = handle.getSnapshot().status
      if (status === 'queued' || status === 'running' || status === 'preview-ready') handle.checkSource()
    })
    this.entries.set(jobId, entry)
    this.refresh(entry)
    void handle.start()
    this.refresh(entry)
    return this.snapshot(entry)
  }

  private refresh(entry: JobEntry): void {
    const current = entry.handle.getSnapshot()
    if (current.preview) entry.report = current.preview.report
    entry.updatedAtMs = this.clock()
    this.emit()
  }

  private snapshot(entry: JobEntry): MCPPhysicsBakeJobSnapshot {
    const current = entry.handle.getSnapshot()
    const generation = entry.definition.generation
    const generations = entry.definition.generations
    return {
      jobId: entry.jobId,
      mode: entry.definition.mode,
      label: entry.definition.label,
      sourceLayerId: entry.definition.sourceLayerId,
      timelineId: entry.definition.recipe.timelineId,
      sourceRevision: entry.definition.recipe.source.revision,
      documentRevisionAtStart: entry.documentRevisionAtStart,
      status: current.status,
      progress: current.progress,
      createdAtMs: entry.createdAtMs,
      updatedAtMs: entry.updatedAtMs,
      recipeHash: entry.report?.recipeHash ?? entry.definition.recipe.recipeHash,
      ...(entry.definition.replaceRecordId ? { replaceRecordId: entry.definition.replaceRecordId } : {}),
      ...(entry.report ? { report: entry.report } : {}),
      ...(generation ? {
        generationId: generation.generationId,
        fragmentCount: generation.fragments.length,
        generationCount: generations?.length ?? 1,
        totalFragmentCount: generations?.reduce((sum, item) => sum + item.fragments.length, 0)
          ?? generation.fragments.length,
      } : {}),
      ...(current.error ? { error: current.error } : {}),
    }
  }

  private emit(): void {
    this.listCache = Array.from(this.entries.values())
      .sort((left, right) => right.createdAtMs - left.createdAtMs)
      .map(entry => this.snapshot(entry))
    this.listeners.forEach(listener => listener())
  }

  private require(jobId: string): JobEntry {
    const entry = this.entries.get(jobId)
    if (!entry) throw new Error(`Bake job not found: ${jobId}`)
    return entry
  }

  private uniqueId(): string {
    for (let attempt = 0; attempt < 4; attempt++) {
      const id = this.idFactory()
      if (/^bake-[A-Za-z0-9_-]{8,120}$/.test(id) && !this.entries.has(id)) return id
    }
    throw new Error('Unable to allocate a unique bake job id')
  }

  private prune(): void {
    const threshold = this.clock() - TERMINAL_TTL_MS
    for (const [jobId, entry] of Array.from(this.entries)) {
      const status = entry.handle.getSnapshot().status
      if (entry.updatedAtMs < threshold && isTerminal(status)) this.discard(jobId)
    }
  }
}

/** Tab-local manager shared by the MCP bridge and Jobs & Bake dock. */
export const mcpPhysicsBakeJobs = new MCPPhysicsBakeJobManager()

function randomJobId(): string {
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure bake job ids require crypto.randomUUID')
  return `bake-${globalThis.crypto.randomUUID()}`
}

function clampTime(timeMs: number, durationMs: number): number {
  if (!Number.isFinite(timeMs)) throw new RangeError('Bake preview time must be finite')
  return Math.max(0, Math.min(durationMs, timeMs))
}

function isTerminal(status: BakeJobStatus): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'failed' || status === 'stale'
}
