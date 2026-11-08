import { describe, expect, it } from 'vitest'
import type { Asset } from '@/lib/types'
import { summarizeMediaResources, type MediaElement } from './mediaResources'
const audio = { bytes: 16, bufferCount: 1, pendingCount: 0, assets: [{ id: 'a', bytes: 16 }] }
const asset = (id: string, type: Asset['type'] = 'image', url = id): Asset => ({ id, name: id, type, url })

describe('project media inventory', () => {
  it('reports cold managed visual metadata separately from current preparation/errors without starting loads', () => {
    const snapshot = () => ({ loading: ['pending'], errors: { broken: 'native failure' } })
    const elements = Object.assign(new Map<string, MediaElement>(), { media: { snapshot } })
    const result = summarizeMediaResources([asset('pending'), asset('cold'), asset('broken', 'video')], elements, audio, {})
    expect(result.rows.map(row => row.state)).toEqual(['loading', 'notResident', 'error'])
    expect(result).toMatchObject({ loading: 1, notResident: 1, errors: 1 })
  })
  it('distinguishes absent PCM, current decode and unavailable legacy diagnostics', () => {
    const assets = [asset('resident', 'audio'), asset('pending', 'audio'), asset('idle', 'audio')]
    const known = { bytes: 16, bufferCount: 1, pendingCount: 1, assets: [{ id: 'resident', bytes: 16 }], loadingAssetIds: ['pending'] }
    const summary = summarizeMediaResources(assets, new Map(), known, {})
    expect(summary).toMatchObject({ ready: 1, loading: 1, notResident: 1, untracked: 0 })
    expect(summary.rows.map(row => row.state)).toEqual(['ready', 'loading', 'notResident'])
    const legacy = summarizeMediaResources(assets, new Map(), { bytes: 0, bufferCount: 0, pendingCount: 0, assets: [] }, {})
    expect(legacy).toMatchObject({ loading: 0, notResident: 0, untracked: 3 })
  })
  it('separates source bytes, image pixels, video display frame and PCM without duplicating shared elements', () => {
    const image = { naturalWidth: 100, naturalHeight: 50, complete: true }
    const assets = [{ ...asset('i', 'image', 'shared'), metadata: { filesize: 1024 } },
      { ...asset('same', 'image', 'shared'), metadata: { filesize: 1024 } }, asset('v', 'video'), asset('a', 'audio'), asset('f', 'font')]
    const summary = summarizeMediaResources(assets, new Map<string, MediaElement>([
      ['i', image], ['same', image], ['v', { videoWidth: 20, videoHeight: 10, readyState: 2, paused: false }],
    ]), audio, {})
    expect(summary).toMatchObject({ total: 5, ready: 4, untracked: 1, sourceBytes: 1024, unknownSourceSizes: 3,
      imageBytes: 20000, videoFrameBytes: 800, playingVideos: 1 })
    expect(summary.rows.find(row => row.id === 'a')?.bytes).toBe(16)
    expect(summary.rows[0]).not.toHaveProperty('url')
  })
  it('reports load/errors/unknown state and exposes all resources through bounded searchable pages', () => {
    const assets = Array.from({ length: 3000 }, (_, i) => asset(`image-${i}`))
    const elements = new Map([['image-0', { complete: true, naturalWidth: 0, naturalHeight: 0 }]])
    const first = summarizeMediaResources(assets, elements, audio, {})
    expect(first).toMatchObject({ errors: 1, loading: 2999, pages: 120 })
    expect(first.rows).toHaveLength(25)
    const last = summarizeMediaResources(assets, elements, audio, {}, { page: 999, search: '' })
    expect(last.rows.at(-1)?.id).toBe('image-2999')
    const filtered = summarizeMediaResources(assets, elements, audio, {}, { page: 999, search: 'image-2999' })
    expect(filtered).toMatchObject({ page: 0, filteredCount: 1 })
    expect(filtered.rows[0].id).toBe('image-2999')
  })
})

it('reports managed font ownership without inventing native decoded bytes',()=>{
  const states={ready:'ready',pending:'loading',bad:'error',cold:'notResident'} as const
  const assets=Object.keys(states).map(id=>asset(id,'font'))
  const elements=Object.assign(new Map<string,MediaElement>(),{fonts:{state:(a:Asset)=>states[a.id as keyof typeof states]}})
  const summary=summarizeMediaResources(assets,elements,audio,{})
  expect(summary).toMatchObject({ready:1,loading:1,errors:1,notResident:1,imageBytes:0,videoFrameBytes:0})
  expect(summary.rows.every(row=>row.bytes===null)).toBe(true)
})
