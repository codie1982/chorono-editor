import type { Asset } from '@/lib/types'
import type { AudioResourceSnapshot } from '@/lib/audioEngine'

/** Structural read-only view: no DOM constructor/decoding or browser context is required. */
export interface MediaElement {
  naturalWidth?: number; naturalHeight?: number; complete?: boolean
  videoWidth?: number; videoHeight?: number; readyState?: number; paused?: boolean
  error?: unknown
  getAttribute?(name: string): string | null
}
export interface MediaQuery { page: number; search: string }
export interface MediaResourceRow {
  id: string; name: string; type: string
  state: 'ready' | 'loading' | 'error' | 'untracked'
  bytes: number | null
}
export interface MediaResourceSnapshot {
  total: number; ready: number; loading: number; errors: number; untracked: number
  images: number; videos: number; playingVideos: number
  imageBytes: number; videoFrameBytes: number; sourceBytes: number; unknownSourceSizes: number
  rows: MediaResourceRow[]; page: number; pages: number; filteredCount: number
}

/**
 * Summarizes current project assets and live media element readiness. Each
 * decoded element is counted once even if several ids share it; source-file
 * sizes are deduplicated by URL and never mixed with decoded RAM estimates.
 * Video counts one RGBA display frame, not browser decoder/buffer residency.
 * Audio row bytes are descriptive; the deduplicated PCM total comes from its
 * owner separately. Only 25 rows are retained per page; aggregate counts scan
 * all assets without materializing their data/URLs or serializing scene JSON.
 */
export function summarizeMediaResources(
  assets: readonly Asset[], elements: ReadonlyMap<string, MediaElement>,
  audio: AudioResourceSnapshot, audioErrors: Record<string, string>,
  query: MediaQuery = { page: 0, search: '' },
): MediaResourceSnapshot {
  const search = query.search.trim().toLocaleLowerCase('tr-TR')
  const matches = (asset: Asset) => !search || asset.name.toLocaleLowerCase('tr-TR').includes(search)
  const filteredCount = assets.reduce((sum, asset) => sum + Number(matches(asset)), 0)
  const pages = Math.max(1, Math.ceil(filteredCount / 25))
  const page = Math.max(0, Math.min(pages - 1, Math.floor(query.page) || 0))
  const result: MediaResourceSnapshot = { total: assets.length, ready: 0, loading: 0, errors: 0, untracked: 0,
    images: 0, videos: 0, playingVideos: 0, imageBytes: 0, videoFrameBytes: 0,
    sourceBytes: 0, unknownSourceSizes: 0, rows: [], page, pages, filteredCount }
  const seen = new Set<MediaElement>()
  const sources = new Map<string, number | null>()
  const pcm = new Map(audio.assets.map(asset => [asset.id, asset.bytes]))
  let matchIndex = 0
  for (const asset of assets) {
    const fileBytes = asset.metadata?.filesize
    const known = typeof fileBytes === 'number' && Number.isFinite(fileBytes) && fileBytes >= 0 ? fileBytes : null
    const previous = sources.get(asset.url)
    sources.set(asset.url, previous != null ? Math.max(previous, known ?? 0) : known)
    let state: MediaResourceRow['state'] = 'untracked', bytes: number | null = null
    const element = elements.get(asset.id)
    const sameSource = element && (!element.getAttribute || element.getAttribute('src') === asset.url)
    if (asset.type === 'image' || asset.type === 'spriteSheet') {
      result.images++
      if (sameSource) {
        const width = element.naturalWidth ?? 0, height = element.naturalHeight ?? 0
        state = width > 0 && height > 0 ? 'ready' : element.complete ? 'error' : 'loading'
        if (state === 'ready') bytes = width * height * 4
        if (bytes !== null && !seen.has(element)) result.imageBytes += bytes
      } else state = 'loading'
    } else if (asset.type === 'video') {
      result.videos++
      if (sameSource) {
        state = element.error ? 'error' : (element.readyState ?? 0) >= 2 ? 'ready' : 'loading'
        if (state === 'ready') {
          bytes = (element.videoWidth ?? 0) * (element.videoHeight ?? 0) * 4
          if (!seen.has(element)) {
            result.videoFrameBytes += bytes
            if (element.paused === false) result.playingVideos++
          }
        }
      } else state = 'loading'
    } else if (asset.type === 'audio') {
      bytes = pcm.get(asset.id) ?? null
      state = audioErrors[asset.id] ? 'error' : bytes !== null ? 'ready' : 'loading'
    }
    if (sameSource) seen.add(element)
    if (state === 'ready') result.ready++
    else if (state === 'loading') result.loading++
    else if (state === 'error') result.errors++
    else result.untracked++
    if (matches(asset)) {
      if (matchIndex >= page * 25 && matchIndex < (page + 1) * 25) {
        result.rows.push({ id: asset.id, name: asset.name, type: asset.type, state, bytes })
      }
      matchIndex++
    }
  }
  sources.forEach(bytes => { if (bytes === null) result.unknownSourceSizes++; else result.sourceBytes += bytes })
  return result
}
