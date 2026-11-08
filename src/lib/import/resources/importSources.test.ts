import { describe, expect, it, vi } from 'vitest'
import { assetSourcePool, AssetSourceOwner } from '../../asset/sources'
import { withImportSource, releaseImportSources } from './importSources'
import type { ImportResult } from '../types'

const result = (url: string): ImportResult => ({ id: 'source', source: { kind: 'file', value: 'fixture', timestamp: 0 }, format: 'image/png', kind: 'asset',
  assets: [{ id: 'a', name: 'a', type: 'image', url, runtime: { objectUrl: url } }], layers: [], groups: [], tracks: [], timelines: [], commands: [],
  warnings: [], errors: [], unsupportedFeatures: [], report: { title: 'fixture', sourceFileName: 'fixture', format: 'image/png',
    created: { assets: 1, layers: 0, groups: 0, tracks: 0, compositions: 0 }, warnings: [], errors: [], unsupportedFeatures: [], suggestions: [], durationMs: 0 } })

describe('import creator ownership', () => {
  it('cleans sync/async construction errors and does not serialize runtime lease handles', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    try {
      expect(() => withImportSource(new Blob(['sync']), () => { throw new Error('sync failure') })).toThrow('sync failure')
      await expect(withImportSource(new Blob(['async']), async () => { throw new Error('async failure') })).rejects.toThrow('async failure')
      await Promise.resolve()
      expect(revoke).toHaveBeenCalledTimes(2)
      const imported = withImportSource(new Blob(['ok']), result)
      expect(JSON.stringify(imported)).not.toContain('release')
      releaseImportSources(imported); releaseImportSources(imported); await Promise.resolve()
      expect(revoke).toHaveBeenCalledTimes(3)
    } finally { revoke.mockRestore() }
  })

  it('transfers creator ownership to document adoption even for an old caller that keeps the result', async () => {
    const imported = await withImportSource(new Blob(['source']), async url => result(url))
    const owner = new AssetSourceOwner()
    owner.update([imported.assets]); owner.start()
    owner.stop(); await Promise.resolve()
    await expect(fetch(imported.assets[0].url)).rejects.toThrow()
    releaseImportSources(imported)
    expect(assetSourcePool.getSnapshot().ownedUrls).toBe(0)
  })
})
