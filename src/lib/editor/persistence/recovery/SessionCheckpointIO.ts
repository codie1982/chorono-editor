import type { ChronoScene } from '../../../types'
import { assetSourcePool } from '../../../asset/sources'
import { parseSceneJson } from '../../../format/scene/SceneJsonConverter'
import { sceneSourceData } from '../../../format/scene/sceneSourceData'
import { editorOutputResources, outputJson, type OutputResources } from '../../../export/resources'
import { BoundedBinaryReader } from '../../../resources/io'
import type { SessionCheckpoint } from './SessionCheckpoint'
import type { SessionCheckpointStore } from './IndexedDbSessionStore'
import { initHistory, type HistoryState } from '../../history'
import { encodeHistory, decodeHistory } from '../../history/HistoryGraph'
import { HistorySourceView } from '../../history/HistorySourceView'
import { historyAssets } from '../../session/SessionProject'

/** Count cached and new encoded media together; a saved checkpoint must also
 * fit the restore policy. Empty files are valid source bytes, not image quality. */
function mediaBytes(total: number, size: number): number {
  const next = total + size
  if (size > 64 * 1024 ** 2 || next > 256 * 1024 ** 2) throw new RangeError('Local recovery media limit exceeded. Save a project file before leaving.')
  return next
}

/** Budgeted source/media preparation through actual IDB settlement. Reuses
 * output admission and bounded binary readers; each uncached Blob is fetched
 * once per tab/source URL, up to 64 MiB per asset and 256 MiB per checkpoint.
 * No base64 conversion, decoded media or dense render buffers are retained.
 * Source leases outlive queued work and native IO; failures leave old data.
 */
export async function saveSessionCheckpoint(scene: ChronoScene, metadata: Omit<SessionCheckpoint, 'json' | 'assetUrls'>,
  store: SessionCheckpointStore, signal?: AbortSignal, resources: OutputResources = editorOutputResources, history?: HistoryState): Promise<void> {
  const allAssets = history ? historyAssets(history) : scene.assets
  await assetSourcePool.withAssets(allAssets, async () => {
    const result = await resources.run(async (scope, active) => {
      const view = history ? new HistorySourceView().get(scene) : sceneSourceData(scene)
      if (allAssets.length > 500) throw new RangeError('Local recovery supports up to 500 media assets. Save Scene JSON before leaving.')
      const text = outputJson(scope, view, { maxChars: 32 * 1024 ** 2, maxBytes: 64 * 1024 ** 2 })
      const graph = history ? encodeHistory(history) : undefined
      const urls = Array.from(new Set(allAssets.map(asset => asset.url).filter(url => url.startsWith('blob:'))))
      const blobs = new Map<string, Blob>(), reader = new BoundedBinaryReader({ maxBytes: 64 * 1024 ** 2, budget: scope.budget })
      let bytes = 0
      for (const url of urls) {
        scope.check(active)
        const cached = await store.readAsset(metadata.id, url)
        if (cached) { bytes = mediaBytes(bytes, cached.size); continue }
        const response = await fetch(url, { signal: active })
        const mime = response.headers.get('content-type') ?? 'application/octet-stream'
        if (mime.length > 1024) throw new RangeError('Recovery media MIME header is too long.')
        const input = await reader.readResponse(response, { signal: active })
        try {
          bytes = mediaBytes(bytes, input.buffer.byteLength)
          const blob = scope.own(Math.max(1, input.buffer.byteLength), () => new Blob([input.buffer], { type: mime }))
          blobs.set(url, blob.value)
        } finally { input.release() }
      }
      scope.check(active)
      await store.write({ ...metadata, ...(graph ? { version: 2, history: graph } : {}), json: text.value, assetUrls: urls }, blobs, active)
    }, { signal })
    result.release()
  })
}

/** Hydrate source IDs/keys/authoring exactly; only expired Blob URLs are remapped
 * to fresh owned handles. All referenced bytes must exist before returning.
 * The caller releases creator leases after editor adoption, or on cancellation.
 * A partial/failed restore releases every newly created URL and changes no UI.
 */
export async function restoreSessionCheckpoint(record: SessionCheckpoint, store: SessionCheckpointStore): Promise<{ scene: ChronoScene; history: HistoryState; warning?: string; release(): void }> {
  const scene = parseSceneJson(record.json, true), leases: { release(): void }[] = [], urls = new Map<string, string>()
  let history = initHistory(scene), warning: string | undefined
  if (record.history) try { history = decodeHistory(scene, record.history) } catch (error) { warning = `History could not be restored: ${(error as Error).message}` }
  let bytes = 0
  try {
    const assets = historyAssets(history), originals = assets.map(asset => ({ asset, url: asset.url }))
    for (const { asset, url: old } of originals) {
      if (!asset.url.startsWith('blob:')) continue
      if (!urls.has(old)) {
        const blob = await store.readAsset(record.id, old)
        if (!blob) throw new Error('Recovery media is missing. The saved checkpoint was kept; open your project file to recover it.')
        bytes = mediaBytes(bytes, blob.size)
        const lease = assetSourcePool.create(blob); leases.push(lease); urls.set(old, lease.url)
      }
      asset.url = urls.get(old)!; asset.runtime = { objectUrl: asset.url }
    }
    // Shared URLs may occur in distinct descriptors across Undo/Redo snapshots.
    for (const value of [history.present, ...history.past, ...history.future]) for (const asset of value.assets) {
      if (urls.has(asset.url)) { asset.url = urls.get(asset.url)!; asset.runtime = { objectUrl: asset.url } }
    }
    return { scene: history.present, history, warning, release: () => leases.forEach(lease => lease.release()) }
  } catch (error) { leases.forEach(lease => lease.release()); throw error }
}
