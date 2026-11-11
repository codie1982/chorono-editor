import { IndexedDbSessionStore } from './IndexedDbSessionStore'
import { decodeCheckpoint, writeSessionJournal, JOURNAL_PREFIX, LATEST_KEY, TAB_KEY, type SessionCheckpoint } from './SessionCheckpoint'
import { restoreSessionCheckpoint, saveSessionCheckpoint } from './SessionCheckpointIO'
import type { ChronoScene } from '../../../types'

export interface BrowserRecoverySession {
  id: string
  store: IndexedDbSessionStore
  storage: Storage | null
  scene?: ChronoScene
  restored: boolean
  sequence: number
  warning?: string
  release(): void
  dispose(): void
}

/** Hold a browser lock for this page lifetime. Duplicated tabs may inherit
 * sessionStorage; a busy slot must fork instead of replacing another tab's
 * draft. Browsers without Web Locks use a fresh slot on each startup. */
async function reserveSlot(proposed: string): Promise<{ id: string; release(): void }> {
  if (!navigator.locks) return { id: crypto.randomUUID(), release() {} }
  let release!: () => void
  const lifetime = new Promise<void>(resolve => { release = resolve })
  const available = await new Promise<boolean>(resolve => {
    void navigator.locks.request(`chorono-recovery:${proposed}`, { ifAvailable: true }, lock => {
      resolve(!!lock); return lock ? lifetime : undefined
    }).catch(() => resolve(false))
  })
  return available ? { id: proposed, release } : { id: crypto.randomUUID(), release() {} }
}

/** Startup barrier before editor/MCP authoring mounts. The same tab reads its
 * own checkpoint; a new tab borrows the last workspace into an independent slot.
 * The synchronous journal wins over older IDB source. Corruption/blocked storage
 * is reported, retained and never overwritten by a default scene on startup.
 * Creator leases must be released after editor adoption or cancelled startup.
 */
export async function openBrowserRecovery(databaseName?: string): Promise<BrowserRecoverySession> {
  let storage: Storage | null = null, tab: Storage | null = null
  try { storage = window.localStorage } catch { /* IDB may still be usable. */ }
  try { tab = window.sessionStorage } catch { /* Reopen uses the latest persisted source. */ }
  let own: string | null = null, localLatest: string | null = null
  try { own = tab?.getItem(TAB_KEY) ?? null; localLatest = storage?.getItem(LATEST_KEY) ?? null } catch { /* Independent database fallback. */ }
  const validId = (value: string | null) => value && /^[a-zA-Z0-9_-]{1,100}$/.test(value) ? value : null
  own = validId(own); localLatest = validId(localLatest)
  const reservation = await reserveSlot(own ?? crypto.randomUUID()), id = reservation.id
  try { tab?.setItem(TAB_KEY, id) } catch { /* Local recovery status still reflects actual storage. */ }
  let factory: IDBFactory | undefined
  try { factory = window.indexedDB } catch { /* Security settings may deny IDB access. */ }
  const store = new IndexedDbSessionStore(factory, databaseName)
  const result: BrowserRecoverySession = { id, store, storage, restored: false, sequence: 0, release() {},
    dispose() { result.release(); reservation.release(); store.close() } }
  let latest: string | null = null
  try { latest = await store.latest() } catch (error) { result.warning = (error as Error).message }
  const candidates = new Set<string>(own ? [own] : [localLatest, latest].filter((value): value is string => !!value))
  const records: SessionCheckpoint[] = []
  const readCandidate = async (key: string) => {
    try { const raw = storage?.getItem(JOURNAL_PREFIX + key)
      if (raw) { const record = decodeCheckpoint(JSON.parse(raw)); if (!record) throw new Error('Invalid local recovery journal.'); records.push(record) }
    } catch (error) { result.warning = (error as Error).message }
    try { const raw = await store.read(key)
      if (raw) { const record = decodeCheckpoint(raw); if (!record) throw new Error('Invalid local recovery checkpoint.'); records.push(record) }
    } catch (error) { result.warning = (error as Error).message }
  }
  for (const key of Array.from(candidates)) await readCandidate(key)
  // A freshly forked tab may not have authored anything yet. Its slot has no
  // record; reload should still return to the borrowed last workspace. A corrupt
  // own record is not silently replaced with another tab's source.
  if (own && !records.length) {
    for (const key of Array.from(new Set([localLatest, latest].filter((value): value is string => !!value && value !== own)))) await readCandidate(key)
  }
  records.sort((a, b) => a.id === b.id ? b.sequence - a.sequence : b.savedAt - a.savedAt)
  for (const record of records) try {
    const restored = await restoreSessionCheckpoint(record, store)
    result.scene = restored.scene; result.release = restored.release; result.restored = true
    result.sequence = id === record.id ? record.sequence : 0
    if (id !== record.id) {
      // A fork needs its own baseline before editing. Following the origin's
      // latest pointer on every reload would make an untouched tab drift when
      // another tab edits. Reuse the same media/budgeted save contract.
      const metadata = { version: 1 as const, id, sequence: 1, savedAt: record.savedAt }
      let journalSafe = false
      try { journalSafe = writeSessionJournal(storage, metadata, restored.scene) } catch { /* IDB may still succeed. */ }
      try { await saveSessionCheckpoint(restored.scene, metadata, store) }
      catch (error) { if (!journalSafe) result.warning = (error as Error).message }
      result.sequence = 1
    }
    return result
  } catch (error) { result.warning = (error as Error).message }
  return result
}
