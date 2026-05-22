import { describe, it, expect, vi } from 'vitest'
import { ImportManager } from '../ImportManager'
import { BaseImportHandler } from '../handlers/BaseHandler'
import type { ImportFormat, ImportOptions, ImportResult, ImportPreflight, ImportEvent } from '../types'

// ── Fake handlers ───────────────────────────────────────────────────────────────

function emptyResult(format: ImportFormat, name: string): ImportResult {
  return {
    id: 'r', source: { kind: 'file', value: name, timestamp: 0 }, format, kind: 'asset',
    assets: [], layers: [], groups: [], tracks: [], timelines: [], commands: [],
    warnings: [], errors: [], unsupportedFeatures: [],
    report: {
      title: 'X', sourceFileName: name, format,
      created: { assets: 0, layers: 0, groups: 0, tracks: 0, compositions: 0 },
      warnings: [], errors: [], unsupportedFeatures: [], suggestions: [], durationMs: 0,
    },
  }
}

class OkHandler extends BaseImportHandler {
  readonly kind = 'asset' as const
  readonly supportedFormats: ImportFormat[] = ['image/png']
  async preflight(file: File): Promise<ImportPreflight> {
    return {
      source: this.makeSource(file), format: 'image/png', kind: 'asset',
      summary: { estimatedLayers: 0, estimatedAssets: 1, estimatedGroups: 0, estimatedTracks: 0, estimatedMemoryBytes: 0, detectedFeatures: [], unsupportedFeatures: [] },
      availableOptions: {}, defaultOptions: {}, warnings: [],
    }
  }
  async handle(file: File, _o?: ImportOptions): Promise<ImportResult> {
    return emptyResult('image/png', file.name)
  }
}

class ThrowHandler extends BaseImportHandler {
  readonly kind = 'asset' as const
  readonly supportedFormats: ImportFormat[] = ['image/png']
  async preflight(file: File): Promise<ImportPreflight> {
    return {
      source: this.makeSource(file), format: 'image/png', kind: 'asset',
      summary: { estimatedLayers: 0, estimatedAssets: 0, estimatedGroups: 0, estimatedTracks: 0, estimatedMemoryBytes: 0, detectedFeatures: [], unsupportedFeatures: [] },
      availableOptions: {}, defaultOptions: {}, warnings: [],
    }
  }
  async handle(): Promise<ImportResult> { throw new Error('boom') }
}

const png = () => new File([new Uint8Array([0x89, 0x50])], 'pic.png', { type: 'image/png' })

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('ImportManager import events', () => {
  it('emits importStart then importComplete on success', async () => {
    const mgr = new ImportManager()
    mgr.registerHandler(new OkHandler())
    const events: ImportEvent[] = []
    mgr.onImportEvent(e => events.push(e))

    await mgr.importFileAs(png(), 'image/png')

    expect(events.map(e => e.type)).toEqual(['importStart', 'importComplete'])
    expect(events[0].source).toBe('pic.png')
    expect(events[1].result).toBeDefined()
  })

  it('emits importError and rethrows on failure', async () => {
    const mgr = new ImportManager()
    mgr.registerHandler(new ThrowHandler())
    const events: ImportEvent[] = []
    mgr.onImportEvent(e => events.push(e))

    await expect(mgr.importFileAs(png(), 'image/png')).rejects.toThrow('boom')
    expect(events.map(e => e.type)).toEqual(['importStart', 'importError'])
    expect(events[1].error).toBe('boom')
  })

  it('unsubscribe stops further events', async () => {
    const mgr = new ImportManager()
    mgr.registerHandler(new OkHandler())
    const fn = vi.fn()
    const off = mgr.onImportEvent(fn)
    off()
    await mgr.importFileAs(png(), 'image/png')
    expect(fn).not.toHaveBeenCalled()
  })

  it('a throwing listener never breaks the import', async () => {
    const mgr = new ImportManager()
    mgr.registerHandler(new OkHandler())
    mgr.onImportEvent(() => { throw new Error('listener blew up') })
    await expect(mgr.importFileAs(png(), 'image/png')).resolves.toBeDefined()
  })
})
