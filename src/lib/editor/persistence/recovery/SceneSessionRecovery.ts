import type { ChronoScene } from '../../../types'
import { assetSourcePool } from '../../../asset/sources'
import { SceneAutoSaveCoordinator } from '../SceneAutoSaveCoordinator'
import { writeSessionJournal, type SessionCheckpoint } from './SessionCheckpoint'

export interface RecoveryStatus { state: 'idle' | 'pending' | 'saving' | 'saved' | 'error'; safeToLeave: boolean; savedAt?: number; error?: string }
interface Options {
  id: string
  sequence?: number
  storage: Pick<Storage, 'setItem'> | null
  save(scene: ChronoScene, metadata: Omit<SessionCheckpoint, 'json' | 'assetUrls'>, signal: AbortSignal): Promise<void>
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
        await options.save(scene, metadata, signal)
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
    const metadata = { version: 1 as const, id: this.options.id, sequence: this.sequence, savedAt: Date.now() }
    this.metadata.set(scene, metadata)
    let error: string | undefined
    try { this.journalSafe = writeSessionJournal(this.options.storage, metadata, scene) }
    catch (failure) { this.journalSafe = false; error = (failure as Error).message }
    this.safe = this.journalSafe; this.emit('pending', error)
    this.coordinator.request(scene, repeated)
  }
  /** Retry/flush the current committed input without inventing a new revision. */
  flush(): void { if (this.current && !this.closed) this.coordinator.request(this.current, true) }
  get safeToLeave(): boolean { return this.safe }
  dispose(): void { this.closed = true; this.coordinator.dispose() }
  private emit(state: RecoveryStatus['state'], error?: string): void {
    this.options.onStatus({ state, safeToLeave: this.safe, savedAt: this.savedAt, error })
  }
}
