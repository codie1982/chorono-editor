import type { ChronoScene } from '../../../types'
import { assetSourcePool } from '../../../asset/sources'
import { parseSceneJson } from '../../../format/scene/SceneJsonConverter'
import { sceneSourceData } from '../../../format/scene/sceneSourceData'
import { editorOutputResources, outputJson, type OutputResources } from '../../../export/resources'
import { BoundedBinaryReader } from '../../../resources/io'
import type { SessionCheckpoint } from './SessionCheckpoint'
import type { SessionCheckpointStore } from './IndexedDbSessionStore'

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
  store: SessionCheckpointStore, signal?: AbortSignal, resources: OutputResources = editorOutputResources): Promise<void> {
  await assetSourcePool.withAssets(scene.assets, async () => {
    const result = await resources.run(async (scope, active) => {
      const view = sceneSourceData(scene)
      if (view.assets.length > 500) throw new RangeError('Local recovery supports up to 500 media assets. Save Scene JSON before leaving.')
      const text = outputJson(scope, view, { maxChars: 32 * 1024 ** 2, maxBytes: 64 * 1024 ** 2 })
      const urls = Array.from(new Set(view.assets.map(asset => asset.url).filter(url => url.startsWith('blob:'))))
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
      await store.write({ ...metadata, json: text.value, assetUrls: urls }, blobs, active)
    }, { signal })
    result.release()
  })
}

/** Hydrate source IDs/keys/authoring exactly; only expired Blob URLs are remapped
 * to fresh owned handles. All referenced bytes must exist before returning.
 * The caller releases creator leases after editor adoption, or on cancellation.
 * A partial/failed restore releases every newly created URL and changes no UI.
 */
export async function restoreSessionCheckpoint(record: SessionCheckpoint, store: SessionCheckpointStore): Promise<{ scene: ChronoScene; release(): void }> {
  const scene = parseSceneJson(record.json, true), leases: { release(): void }[] = [], urls = new Map<string, string>()
  let bytes = 0
  try {
    for (const asset of scene.assets) {
      if (!asset.url.startsWith('blob:')) continue
      const old = asset.url
      if (!urls.has(old)) {
        const blob = await store.readAsset(record.id, old)
        if (!blob) throw new Error('Recovery media is missing. The saved checkpoint was kept; open your project file to recover it.')
        bytes = mediaBytes(bytes, blob.size)
        const lease = assetSourcePool.create(blob); leases.push(lease); urls.set(old, lease.url)
      }
      asset.url = urls.get(old)!; asset.runtime = { objectUrl: asset.url }
    }
    return { scene, release: () => leases.forEach(lease => lease.release()) }
  } catch (error) { leases.forEach(lease => lease.release()); throw error }
}
