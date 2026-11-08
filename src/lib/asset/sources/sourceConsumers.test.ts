import { describe, expect, it } from 'vitest'
import { AssetSourceOwner, assetSourcePool } from './index'
import { emptyScene } from '../../defaults'
import { AudioAssetService } from '../../audio/AudioAssetService'
import { portableScene } from '../../mcp/editor'
import { ImportManager } from '../../import/ImportManager'
import { BaseImportHandler } from '../../import/handlers/BaseHandler'
import { withImportSource } from '../../import/resources/importSources'
import type { ImportFormat, ImportResult } from '../../import/types'
import type { Asset } from '../../types'

function gate() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve }); return { promise, release } }
function owned() {
  const creator = assetSourcePool.create(new Blob(['original'], { type: 'audio/wav' }))
  const asset: Asset = { id: 'source', name: 'source', type: 'audio', url: creator.url, runtime: { objectUrl: creator.url } }
  const owner = new AssetSourceOwner(); owner.update([[asset]]); owner.start()
  return { creator, asset, owner }
}

describe('source consumers', () => {
  it('portable packaging pins old-project sources until their bytes are embedded', async () => {
    const { asset, owner } = owned(), hold = gate(), scene = { ...emptyScene(), assets: [asset] }
    const before = JSON.stringify(scene)
    const pending = portableScene(scene, async (input, options) => { await hold.promise; return fetch(input, options) })
    owner.stop(); await Promise.resolve()
    expect(await (await fetch(asset.url)).text()).toBe('original')
    hold.release(); const portable = await pending
    expect(portable.assets[0].url).toMatch(/^data:audio\/wav;base64,/)
    expect(portable.assets[0].runtime).toBeUndefined(); expect(JSON.stringify(scene)).toBe(before)
    await expect(fetch(asset.url)).rejects.toThrow()
  })

  it('audio preparation borrows the original URL through native settlement, independently of decoded PCM leases', async () => {
    const { asset, owner } = owned(), hold = gate()
    const service = new AudioAssetService({ decodeReserveBytes: 32, maxBytes: 128,
      fetch: async (input, options) => { await hold.promise; return fetch(input, options) },
      createContext: () => ({ state: 'closed', decodeAudioData: async () => ({ length: 4, numberOfChannels: 1, duration: 1 }) as AudioBuffer } as unknown as AudioContext) })
    const pending = service.acquire(asset)
    owner.stop(); await Promise.resolve()
    expect((await fetch(asset.url)).ok).toBe(true)
    hold.release(); const pcm = await pending
    await expect(fetch(asset.url)).rejects.toThrow()
    expect(pcm.buffer.length).toBe(4)
    pcm.release(); service.clearIdle(); await service.dispose()
  })

  it('ImportManager releases an owned result when transaction progress fails after conversion', async () => {
    let source = ''
    class Handler extends BaseImportHandler {
      readonly kind = 'asset' as const
      readonly supportedFormats: ImportFormat[] = ['image/png']
      async preflight(): Promise<never> { throw new Error('not used') }
      async handle(file: File): Promise<ImportResult> {
        return withImportSource(file, async url => { source = url; return {
          id: 'r', source: this.makeSource(file), format: 'image/png', kind: 'asset',
          assets: [{ id: 'a', name: 'a', url, type: 'image', runtime: { objectUrl: url } }],
          layers: [], groups: [], tracks: [], timelines: [], commands: [], warnings: [], errors: [], unsupportedFeatures: [],
          report: { title: 'r', sourceFileName: file.name, format: 'image/png', created: { assets: 1, layers: 0, tracks: 0, groups: 0, compositions: 0 },
            warnings: [], errors: [], unsupportedFeatures: [], suggestions: [], durationMs: 0 },
        } })
      }
    }
    const manager = new ImportManager(); manager.registerHandler(new Handler())
    await expect(manager.importFileAs(new File(['png'], 'test.png'), 'image/png', {}, progress => {
      if (progress.stage === 'creating') throw new Error('commit preparation failed')
    })).rejects.toThrow('commit preparation failed')
    await expect(fetch(source)).rejects.toThrow()
  })
})
