import type { ChronoScene } from '../../../types'
import { assetSourcePool } from '../../../asset/sources'
import { SceneAutoSaveCoordinator } from '../SceneAutoSaveCoordinator'
import { writeSessionJournal, writeSessionManifest, JOURNAL_PREFIX, type SessionCheckpoint } from './SessionCheckpoint'
import type { HistoryState } from '../../history'
import { sessionRecordKey } from '../../session/sessionIdentity'
import { HistorySnapshotIndex } from '../../history/HistorySnapshotIndex'

export interface RecoveryStatus { state: 'idle' | 'pending' | 'saving' | 'saved' | 'error'; safeToLeave: boolean; savedAt?: number; error?: string }
interface Options {
  id: string
  sequence?: number
  slotId?: string
  getSessionId?(): string
  onCheckpoint?(metadata: Omit<SessionCheckpoint, 'json' | 'assetUrls'>): void
  storage: (Pick<Storage, 'setItem'> & Partial<Pick<Storage, 'getItem' | 'removeItem'>>) | null
  save(scene: ChronoScene, metadata: Omit<SessionCheckpoint, 'json' | 'assetUrls'>, signal: AbortSignal, history?: HistoryState): Promise<void>
  onStatus(status: RecoveryStatus): void
}

/** Local recovery orchestration over the existing bounded autosave coordinator.
 * Only committed snapshots enter request(). A synchronous small-scene journal
 * protects the debounce/navigation gap. Large/media scenes require actual IDB
 * settlement; UI/navigation must consult safeToLeave rather than assume saved.
 * One active plus one latest pending scene and finite retries reuse the existing
 * coordinator. Identity + sequence stop old completion from claiming newer edits
 * saved. Constructor does not save a demo or overwrite restored source.
 */
export class SceneSessionRecovery {
  private readonly coordinator: SceneAutoSaveCoordinator
  private readonly metadata = new WeakMap<ChronoScene, Omit<SessionCheckpoint, 'json' | 'assetUrls'>>()
  private readonly snapshots = new HistorySnapshotIndex()
  private sequence: number
  private current?: ChronoScene
  private safe = true
  private journalSafe = false
  private durable?: WeakRef<ChronoScene>
  private savedAt?: number
  private closed = false
  constructor(private readonly options: Options) {
    this.sequence = options.sequence ?? 0
    this.coordinator = new SceneAutoSaveCoordinator({ intervalMs: 250, fallbackMs: 1000,
      retain: scene => assetSourcePool.retainAssets(scene.assets),
      save: async (scene, version, signal) => {
        const metadata = this.metadata.get(scene)!
        const history = this.snapshots.history(scene)
        await options.save(history?.present ?? scene, metadata, signal, history)
        if (!this.closed && this.current === scene) {
          try { writeSessionManifest(options.storage, metadata) } catch { /* IDB is durable even when the small localStorage index is denied. */ }
        }
        // A partial emergency journal must not beat a complete IDB history at
        // the same sequence. Preserve any newer pending journal instead.
        try {
          const raw = options.storage?.getItem?.(JOURNAL_PREFIX + metadata.id)
          if (raw && JSON.parse(raw).sequence <= metadata.sequence) options.storage?.removeItem?.(JOURNAL_PREFIX + metadata.id)
        } catch { /* IDB remains authoritative even if journal cleanup is denied. */ }
        if (!this.closed) { this.durable = new WeakRef(scene); this.savedAt = metadata.savedAt }
        return version + 1
      },
      onStatus: status => {
        if (this.closed) return
        const durable = this.durable?.deref() === this.current
        this.safe = this.journalSafe || durable
        const state = status.state === 'error' ? this.safe ? 'saved' : 'error'
          : durable ? 'saved' : status.state === 'saving' ? 'saving' : 'pending'
        this.emit(state, status.error?.message)
      },
    })
  }
  /** Called synchronously after the editor commit, never from a frame effect. */
  request(scene: ChronoScene): void {
    if (this.closed) return
    const repeated = this.metadata.has(scene)
    this.current = scene; this.sequence++
    const sessionId = this.options.getSessionId?.() ?? this.options.id
    const metadata = { version: this.snapshots.history(scene) ? 2 as const : 1 as const,
      id: this.options.slotId ? sessionRecordKey(sessionId, this.options.slotId) : this.options.id,
      sessionId, slotId: this.options.slotId, sequence: this.sequence, savedAt: Date.now() }
    this.metadata.set(scene, metadata)
    this.options.onCheckpoint?.(metadata)
    let error: string | undefined
    const history = this.snapshots.history(scene)
    try { this.journalSafe = writeSessionJournal(this.options.storage, metadata, history?.present ?? scene, history) }
    catch (failure) { this.journalSafe = false; error = (failure as Error).message }
    this.safe = this.journalSafe; this.emit('pending', error)
    this.coordinator.request(scene, repeated)
  }
  /** History identity is distinct from scene identity: a no-op key command may
   * add a legitimate Undo step without changing the present source object. */
  requestHistory(history: HistoryState): void {
    this.request(this.snapshots.carrier(history))
  }
  /** Retry/flush the current committed input without inventing a new revision. */
  flush(): void { if (this.current && !this.closed) this.coordinator.request(this.current, true) }
  get safeToLeave(): boolean { return this.safe }
  dispose(): void { this.closed = true; this.coordinator.dispose() }
  private emit(state: RecoveryStatus['state'], error?: string): void {
    this.options.onStatus({ state, safeToLeave: this.safe, savedAt: this.savedAt, error })
  }
}
