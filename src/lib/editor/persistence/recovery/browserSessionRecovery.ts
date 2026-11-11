import { IndexedDbSessionStore } from './IndexedDbSessionStore'
import { decodeCheckpoint, writeSessionJournal, JOURNAL_PREFIX, LATEST_KEY, TAB_KEY, type SessionCheckpoint } from './SessionCheckpoint'
import { restoreSessionCheckpoint, saveSessionCheckpoint } from './SessionCheckpointIO'
import type { ChronoScene } from '../../../types'
import type { HistoryState } from '../../history'
import { sessionRecordKey, validSessionId, SLOT_KEY, SESSION_INDEX_PREFIX } from '../../session/sessionIdentity'

export interface BrowserRecoverySession {
  id: string
  slotId: string
  recordId: string
  store: IndexedDbSessionStore
  storage: Storage | null
  scene?: ChronoScene
  history?: HistoryState
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
  const available = await new Promise<boolean | null>(resolve => {
    void navigator.locks.request(`chorono-recovery:${proposed}`, { ifAvailable: true }, lock => {
      resolve(!!lock); return lock ? lifetime : undefined
    }).catch(() => resolve(null))
  })
  // A busy inherited slot must reserve its fresh ID too: otherwise duplicating
  // that fork could claim the unreserved ID and write into the same record.
  if (available === false) return reserveSlot(crypto.randomUUID())
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
  let own: string | null = null, ownSlot: string | null = null, localLatest: string | null = null
  try { own = tab?.getItem(TAB_KEY) ?? null; ownSlot = tab?.getItem(SLOT_KEY) ?? null; localLatest = storage?.getItem(LATEST_KEY) ?? null } catch { /* Independent database fallback. */ }
  const validId = (value: string | null) => value && /^[a-zA-Z0-9_-]{1,220}$/.test(value) ? value : null
  own = validId(own); localLatest = validId(localLatest)
  const reservation = await reserveSlot(validSessionId(ownSlot) ? ownSlot : validSessionId(own) ? own : crypto.randomUUID()), slotId = reservation.id
  try { tab?.setItem(SLOT_KEY, slotId) } catch { /* Local recovery status still reflects actual storage. */ }
  let factory: IDBFactory | undefined
  try { factory = window.indexedDB } catch { /* Security settings may deny IDB access. */ }
  const store = new IndexedDbSessionStore(factory, databaseName)
  const result: BrowserRecoverySession = { id: slotId, slotId, recordId: sessionRecordKey(slotId, slotId), store, storage, restored: false, sequence: 0, release() {},
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
  const steps = (record: SessionCheckpoint) => (record.history?.past.length ?? 0) + (record.history?.future.length ?? 0)
  records.sort((a, b) => a.id === b.id ? b.sequence - a.sequence || steps(b) - steps(a) : b.savedAt - a.savedAt)
  for (const record of records) try {
    const restored = await restoreSessionCheckpoint(record, store)
    result.scene = restored.scene; result.history = restored.history; result.release = restored.release; result.restored = true
    result.warning = restored.warning ?? result.warning
    result.id = validSessionId(record.sessionId) ? record.sessionId : record.id
    result.recordId = sessionRecordKey(result.id, slotId)
    result.sequence = result.recordId === record.id ? record.sequence : 0
    if (result.recordId !== record.id || record.version === 1) {
      // A fork needs its own baseline before editing. Following the origin's
      // latest pointer on every reload would make an untouched tab drift when
      // another tab edits. Reuse the same media/budgeted save contract.
      const metadata = { version: 2 as const, id: result.recordId, sessionId: result.id, slotId, sequence: 1, savedAt: record.savedAt }
      let journalSafe = false
      try { journalSafe = writeSessionJournal(storage, metadata, restored.scene, restored.history) } catch { /* IDB may still succeed. */ }
      try { await saveSessionCheckpoint(restored.scene, metadata, store, undefined, undefined, restored.history) }
      catch (error) { if (!journalSafe) result.warning = (error as Error).message }
      result.sequence = 1
    }
    try { tab?.setItem(TAB_KEY, result.recordId); storage?.setItem(SESSION_INDEX_PREFIX + result.id, JSON.stringify({ sessionId: result.id, checkpointKey: result.recordId, slotId, savedAt: record.savedAt })) } catch { /* IDB recovery remains available. */ }
    return result
  } catch (error) { result.warning = (error as Error).message }
  try { tab?.setItem(TAB_KEY, result.recordId) } catch { /* Status reports storage failures after edits. */ }
  return result
}
