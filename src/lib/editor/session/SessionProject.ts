import type { ChronoScene } from '../../types'
import { initHistory, type HistoryState } from '../history'
import { encodeHistory, decodeHistory, type HistoryGraph } from '../history/HistoryGraph'
import { HistorySourceView } from '../history/HistorySourceView'
import { validSessionId } from './sessionIdentity'

export interface SessionMedia { key: string; presentAssetIndex?: number; dataUrl?: string }
export interface EditorSessionData { version: 1; sessionId: string; history: HistoryGraph; media?: SessionMedia[] }
export type SessionProject = ChronoScene & { editorSession: EditorSessionData }

/** Data-only project envelope, compatible with current scene readers. Metadata
 * stays outside scene/undo snapshots. The optional media table resolves local
 * history-only assets; current source assets remain normal portable data URLs. */
export function makeSessionProject(history: HistoryState, sessionId: string, media?: SessionMedia[]): SessionProject {
  if (!validSessionId(sessionId)) throw new Error('Invalid project session ID.')
  return { ...new HistorySourceView().get(history.present), editorSession: { version: 1, sessionId, history: encodeHistory(history), ...(media?.length ? { media } : {}) } }
}

/** Open old source-only projects or a saved workspace without running commands.
 * Invalid metadata refuses the open atomically. Session metadata is removed from
 * all source snapshots, preventing recursive histories on the next save. */
export function readSessionProject(input: ChronoScene): { history: HistoryState; sessionId?: string; droppedSteps: number } {
  const metadata = (input as Partial<SessionProject>).editorSession
  const present = new HistorySourceView().get(input)
  if (metadata === undefined) return { history: initHistory(present), droppedSteps: 0 }
  if (!metadata || metadata.version !== 1 || !validSessionId(metadata.sessionId)) throw new Error('Unsupported project session metadata.')
  const history = decodeHistory(present, metadata.history)
  const urls = new Map<string, string>()
  if (metadata.media) {
    if (!Array.isArray(metadata.media) || metadata.media.length > 500) throw new Error('Invalid session media table.')
    for (const item of metadata.media) {
      if (!item || typeof item.key !== 'string' || !/^chorono-session-media:\d+$/.test(item.key) || urls.has(item.key)) throw new Error('Invalid session media key.')
      if (item.presentAssetIndex !== undefined && (!Number.isSafeInteger(item.presentAssetIndex) || item.presentAssetIndex < 0)) throw new Error('Invalid session media index.')
      const url = item.presentAssetIndex !== undefined ? present.assets[item.presentAssetIndex]?.url : item.dataUrl
      if (typeof url !== 'string' || !url.startsWith('data:')) throw new Error('Missing portable session media.')
      urls.set(item.key, url)
    }
  }
  for (const scene of [history.present, ...history.past, ...history.future]) for (const asset of scene.assets) {
      const mapped = urls.get(asset.url)
      if (mapped) asset.url = mapped
      else if (asset.url.startsWith('chorono-session-media:')) throw new Error('Missing historical session media.')
  }
  return { history, sessionId: metadata.sessionId, droppedSteps: metadata.history.droppedSteps ?? 0 }
}

/** Union source descriptors for source-URL leases and history-only media IO.
 * Stable URLs are deduplicated; descriptors are borrowed and never mutated. */
export function historyAssets(history: HistoryState): ChronoScene['assets'] {
  const byUrl = new Map<string, ChronoScene['assets'][number]>()
  for (const scene of [history.present, ...history.past, ...history.future]) for (const asset of scene.assets) if (!byUrl.has(asset.url)) byUrl.set(asset.url, asset)
  return Array.from(byUrl.values())
}
