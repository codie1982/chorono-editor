import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AssetRegistry } from '../AssetRegistry'
import type { Asset } from '../types'

// AssetRegistry.deleteAsset frees blob: URLs. URL.revokeObjectURL is a browser
// API absent in Node — stub it so we can assert the revoke lifecycle.

const revoke = vi.fn()

beforeEach(() => {
  revoke.mockReset()
  vi.stubGlobal('URL', { ...URL, revokeObjectURL: revoke })
})
afterEach(() => vi.unstubAllGlobals())

function asset(id: string, over: Partial<Asset> = {}): Asset {
  return { id, name: id, type: 'image', url: `blob:${id}`, ...over }
}

describe('blob URL lifecycle', () => {
  it('revokes a blob: url on deleteAsset', () => {
    const r = new AssetRegistry()
    r.addAsset(asset('a1', { url: 'blob:xyz' }))
    r.deleteAsset('a1')
    expect(revoke).toHaveBeenCalledWith('blob:xyz')
  })

  it('also revokes runtime.objectUrl', () => {
    const r = new AssetRegistry()
    r.addAsset(asset('a1', { url: 'blob:main', runtime: { objectUrl: 'blob:runtime' } }))
    r.deleteAsset('a1')
    expect(revoke).toHaveBeenCalledWith('blob:main')
    expect(revoke).toHaveBeenCalledWith('blob:runtime')
  })

  it('does NOT revoke remote https urls', () => {
    const r = new AssetRegistry()
    r.addAsset(asset('a1', { url: 'https://cdn.example.com/x.png' }))
    r.deleteAsset('a1')
    expect(revoke).not.toHaveBeenCalled()
  })

  it('respects revokeUrl:false (asset moved, not freed)', () => {
    const r = new AssetRegistry()
    r.addAsset(asset('a1', { url: 'blob:keep', runtime: { objectUrl: 'blob:runtime-keep' } }))
    r.deleteAsset('a1', { revokeUrl: false })
    expect(revoke).not.toHaveBeenCalled()
  })

  it('serializeAssets strips runtime so blob refs never persist to JSON', () => {
    const r = new AssetRegistry()
    r.addAsset(asset('a1', { runtime: { objectUrl: 'blob:ephemeral' } }))
    const json = JSON.stringify(r.serializeAssets())
    expect(json).not.toContain('runtime')
    expect(json).not.toContain('blob:ephemeral')
  })
})
