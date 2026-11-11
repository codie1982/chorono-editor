import type { ChronoScene } from '../../../types'
import { parseSceneJson } from '../../../format/scene/SceneJsonConverter'
import { sceneSourceData } from '../../../format/scene/sceneSourceData'
import { measureJson } from '../../../format/json'

export interface SessionCheckpoint {
  version: 1
  id: string
  sequence: number
  savedAt: number
  json: string
  assetUrls: string[]
}
export const JOURNAL_PREFIX = 'chorono.editor-recovery.v1.'
export const LATEST_KEY = `${JOURNAL_PREFIX}latest`
export const TAB_KEY = `${JOURNAL_PREFIX}tab`
const JOURNAL_CHARS = 512 * 1024

/** Validate storage envelopes before parsing source. Corrupt/unsupported records
 * are rejected without deleting them or replacing the last good checkpoint. */
export function decodeCheckpoint(value: unknown): SessionCheckpoint | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<SessionCheckpoint>
  if (record.version !== 1 || typeof record.id !== 'string' || record.id.length > 100
    || !Number.isSafeInteger(record.sequence) || record.sequence! < 1 || !Number.isFinite(record.savedAt)
    || typeof record.json !== 'string' || record.json.length > 32 * 1024 ** 2
    || !Array.isArray(record.assetUrls) || record.assetUrls.length > 500
    || record.assetUrls.some(url => typeof url !== 'string' || !url.startsWith('blob:'))) return null
  parseSceneJson(record.json, true)
  return record as SessionCheckpoint
}

/** Synchronous, bounded emergency checkpoint for small, self-contained scenes.
 * No media is fetched, no runtime objects are serialized and no scene is mutated.
 * Returning false means IndexedDB completion is required before safe navigation.
 * Storage denial/quota failures propagate to the owning recovery status.
 */
export function writeSessionJournal(storage: Pick<Storage, 'setItem'> | null, record: Omit<SessionCheckpoint, 'json' | 'assetUrls'>, scene: ChronoScene): boolean {
  if (!storage || scene.assets.some(asset => asset.url.startsWith('blob:'))) return false
  const view = sceneSourceData(scene)
  try { measureJson(view, { maxChars: JOURNAL_CHARS, maxBytes: JOURNAL_CHARS * 3 }) }
  catch (error) { if (error instanceof RangeError) return false; throw error }
  storage.setItem(JOURNAL_PREFIX + record.id, JSON.stringify({ ...record, json: JSON.stringify(view), assetUrls: [] }))
  storage.setItem(LATEST_KEY, record.id)
  return true
}
