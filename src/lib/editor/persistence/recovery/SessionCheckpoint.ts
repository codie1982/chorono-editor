import type { ChronoScene } from '../../../types'
import { parseSceneJson } from '../../../format/scene/SceneJsonConverter'
import { sceneSourceData } from '../../../format/scene/sceneSourceData'
import { measureJson } from '../../../format/json'
import type { HistoryState } from '../../history'
import { encodeHistory, type HistoryGraph } from '../../history/HistoryGraph'
import { historyAssets } from '../../session/SessionProject'
import { HistorySourceView } from '../../history/HistorySourceView'
import { SESSION_INDEX_PREFIX } from '../../session/sessionIdentity'

export interface SessionCheckpoint {
  version: 1 | 2
  id: string
  sequence: number
  savedAt: number
  json: string
  assetUrls: string[]
  sessionId?: string
  slotId?: string
  history?: HistoryGraph
}
export const JOURNAL_PREFIX = 'chorono.editor-recovery.v1.'
export const LATEST_KEY = `${JOURNAL_PREFIX}latest`
export const TAB_KEY = `${JOURNAL_PREFIX}tab`
const JOURNAL_CHARS = 512 * 1024

/** Small per-project index, independent of whether media/source fits the
 * emergency journal. A durable writer calls this only for its current input;
 * this pointer is a recovery candidate, never proof of a completed IDB write. */
export function writeSessionManifest(storage: Pick<Storage, 'setItem'> | null, record: Omit<SessionCheckpoint, 'json' | 'assetUrls'>): void {
  storage?.setItem(SESSION_INDEX_PREFIX + (record.sessionId ?? record.id), JSON.stringify({ sessionId: record.sessionId ?? record.id, checkpointKey: record.id, slotId: record.slotId, sequence: record.sequence, savedAt: record.savedAt }))
  storage?.setItem(LATEST_KEY, record.id)
}

/** Validate storage envelopes before parsing source. Corrupt/unsupported records
 * are rejected without deleting them or replacing the last good checkpoint. */
export function decodeCheckpoint(value: unknown): SessionCheckpoint | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<SessionCheckpoint>
  if (![1, 2].includes(record.version!) || typeof record.id !== 'string' || record.id.length > 220
    || !Number.isSafeInteger(record.sequence) || record.sequence! < 1 || !Number.isFinite(record.savedAt)
    || typeof record.json !== 'string' || record.json.length > 32 * 1024 ** 2
    || !Array.isArray(record.assetUrls) || record.assetUrls.length > 500
    || record.assetUrls.some(url => typeof url !== 'string' || !url.startsWith('blob:'))) return null
  parseSceneJson(record.json, true)
  if (record.history) measureJson(record.history, { maxBytes: 16 * 1024 ** 2, maxChars: 16 * 1024 ** 2, maxNodes: 1000000 })
  return record as SessionCheckpoint
}

/** Synchronous, bounded emergency checkpoint for small, self-contained scenes.
 * No media is fetched, no runtime objects are serialized and no scene is mutated.
 * Returning false means IndexedDB completion is required before safe navigation.
 * Storage denial/quota failures propagate to the owning recovery status.
 */
export function writeSessionJournal(storage: Pick<Storage, 'setItem'> | null, record: Omit<SessionCheckpoint, 'json' | 'assetUrls'>, scene: ChronoScene, history?: HistoryState): boolean {
  if (!storage || (history ? historyAssets(history) : scene.assets).some(asset => asset.url.startsWith('blob:'))) return false
  const view = history ? new HistorySourceView().get(scene) : sceneSourceData(scene)
  let graph: HistoryGraph | undefined
  try {
    graph = history ? encodeHistory(history, JOURNAL_CHARS / 4) : undefined
    measureJson({ source: view, history: graph }, { maxChars: JOURNAL_CHARS, maxBytes: JOURNAL_CHARS * 3 })
  }
  catch (error) { if (error instanceof RangeError) return false; throw error }
  storage.setItem(JOURNAL_PREFIX + record.id, JSON.stringify({ ...record, ...(graph ? { version: 2, history: graph } : {}), json: JSON.stringify(view), assetUrls: [] }))
  writeSessionManifest(storage, record)
  return !history || graph!.past.length === history.past.length && graph!.future.length === history.future.length
}
