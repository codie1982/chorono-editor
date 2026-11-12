import type { HistoryState } from '../history'
import { HistorySourceView } from '../history/HistorySourceView'
import { encodeHistory } from '../history/HistoryGraph'
import { historyAssets, type SessionMedia, type SessionProject } from './SessionProject'
import { portableSceneInScope } from '../../export/portable/PortableSceneOutput'
import type { OutputScope } from '../../export/resources'
import type { ChronoScene } from '../../types'
import { validSessionId } from './sessionIdentity'
import { limitHistory } from '../history/historyBudget'

/** Portable workspace preparation inside an admitted output job. Local media
 * across Undo/Redo is embedded once, with current-asset references avoiding a
 * second copy in the media table. History uses short media tokens; data URLs
 * do not explode its DAG. Source, IDs, key payloads and ledger are unmodified.
 * Existing portable byte/asset caps apply. Caller pins all history assets.
 */
export async function sessionProjectInScope(history: HistoryState, sessionId: string, scope: OutputScope, signal?: AbortSignal): Promise<SessionProject> {
  if (!validSessionId(sessionId)) throw new Error('Invalid project session ID.')
  scope.own(Math.max(4096, Math.min(64 * 1024 ** 2, limitHistory(history).estimatedBytes * 4)), () => null)
  const assets = historyAssets(history), current = new HistorySourceView().get(history.present)
  const mediaScene = { ...current, layers: [], timelines: [], authoring: undefined, assets }
  const portable = await portableSceneInScope(mediaScene, scope, signal)
  const converted = new Map(assets.map((asset, index) => [asset.url, portable.assets[index].url]))
  const local = assets.filter(asset => asset.url.startsWith('blob:') || asset.url.startsWith('data:'))
  const tokens = new Map(local.map((asset, index) => [asset.url, `chorono-session-media:${index}`]))
  const views = new HistorySourceView(), arrays = new WeakMap<ChronoScene['assets'], ChronoScene['assets']>()
  const view = (scene: ChronoScene): ChronoScene => {
    const source = views.get(scene)
    let mapped = arrays.get(scene.assets)
    if (!mapped) { mapped = source.assets.map(asset => tokens.has(asset.url) ? { ...asset, url: tokens.get(asset.url)!, storage: { ...asset.storage, mode: 'embedded' as const } } : asset); arrays.set(scene.assets, mapped) }
    return { ...source, assets: mapped }
  }
  const source = view(history.present), tokenHistory = { present: source, past: history.past.map(view), future: history.future.map(view) }
  const media: SessionMedia[] = local.map(asset => {
    const index = current.assets.findIndex(item => item.url === asset.url)
    return index >= 0 ? { key: tokens.get(asset.url)!, presentAssetIndex: index } : { key: tokens.get(asset.url)!, dataUrl: converted.get(asset.url)! }
  })
  const graph = encodeHistory(tokenHistory)
  if (graph.past.length !== history.past.length || graph.future.length !== history.future.length) throw new RangeError('Portable history exceeds its graph budget. Keep a local recovery checkpoint and reduce history before exporting.')
  const present = { ...source, assets: source.assets.map((asset, index) => tokens.has(current.assets[index].url) ? { ...asset, url: converted.get(current.assets[index].url)! } : asset) }
  scope.check(signal)
  return { ...present, editorSession: { version: 1, sessionId, history: graph, ...(media.length ? { media } : {}) } }
}
