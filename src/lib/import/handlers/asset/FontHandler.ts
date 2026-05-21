// ── FontHandler ────────────────────────────────────────────────────────────────
//
// Handles WOFF2, TTF, OTF font imports.
// Creates one FontAsset (no layer — fonts are applied to text layers via name).
// Registers the font via the FontFace API so it's immediately usable.

import { BaseImportHandler } from '../BaseHandler'
import type { ImportFormat, ImportOptions, ImportResult, ImportPreflight, ImportProgress } from '../../types'
import type { Asset } from '../../../asset/types'

/** Strip common font file extension to derive a display name */
function fontDisplayName(filename: string): string {
  return filename
    .replace(/\.(woff2?|ttf|otf)$/i, '')
    .replace(/[-_]/g, ' ')
    .trim()
}

/** Map MIME / extension → CSS font-family-safe name (no spaces, no special chars) */
function fontFamilyName(displayName: string): string {
  return displayName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '')
}

export class FontHandler extends BaseImportHandler {
  readonly kind = 'asset' as const
  readonly supportedFormats: ImportFormat[] = [
    'font/woff2',
    'font/ttf',
    'font/otf',
  ]

  async preflight(file: File): Promise<ImportPreflight> {
    const source      = this.makeSource(file)
    const format      = this.getFormat(file)
    const displayName = fontDisplayName(file.name)

    return {
      source,
      format,
      kind:    'asset',
      summary: {
        estimatedLayers:      0, // fonts don't auto-create layers
        estimatedAssets:      1,
        estimatedGroups:      0,
        estimatedTracks:      0,
        estimatedMemoryBytes: file.size,
        detectedFeatures:     [`Font: ${displayName}`],
        unsupportedFeatures:  [],
      },
      availableOptions: {
        collection: true,
      },
      defaultOptions:  {},
      warnings:        [],
    }
  }

  async handle(
    file: File,
    options?: ImportOptions,
    onProgress?: (p: ImportProgress) => void,
  ): Promise<ImportResult> {
    const startMs     = Date.now()
    const displayName = fontDisplayName(file.name)
    const familyName  = fontFamilyName(displayName)

    this.reportProgress(onProgress, 'reading', 'Loading font…', 0.2)

    const url     = URL.createObjectURL(file)
    const assetId = this.generateAssetId()
    const format  = this.getFormat(file)

    // Register with the browser FontFace API so text layers can use it immediately
    const warnings: ImportResult['warnings'] = []
    try {
      const face = new FontFace(familyName, `url(${url})`)
      await face.load()
      document.fonts.add(face)
    } catch {
      warnings.push({
        code:     'unsupported_feature',
        severity: 'warning',
        message:  `Could not register font "${displayName}" — it may not render in text layers`,
      })
    }

    this.reportProgress(onProgress, 'converting', 'Registering font…', 0.8)

    const asset: Asset = {
      id:   assetId,
      name: displayName,
      type: 'font',
      url,
      storage: { mode: 'external', originalFileName: file.name },
      metadata: {
        filesize:   file.size,
        importedAt: Date.now(),
        tags:       [],
        notes:      `family: ${familyName}`,
      },
      runtime: { objectUrl: url },
    }

    this.reportProgress(onProgress, 'complete', 'Done', 1)

    return {
      id:      this.generateId(),
      source:  this.makeSource(file),
      format,
      kind:    'asset',
      assets:  [asset],
      layers:  [],        // Fonts don't auto-create layers
      groups:  [],
      tracks:  [],
      timelines: [],
      commands: [],
      warnings,
      errors:             [],
      unsupportedFeatures: [],
      report: {
        title:          'Font Import',
        sourceFileName: file.name,
        format,
        created:        { assets: 1, layers: 0, groups: 0, tracks: 0, compositions: 0 },
        warnings:       [],
        errors:         [],
        unsupportedFeatures: [],
        suggestions:    ['Apply font by setting the font-family of a text layer to: ' + familyName],
        durationMs:     Date.now() - startMs,
      },
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private getFormat(file: File): ImportFormat {
    const mime = file.type.toLowerCase()
    if (mime === 'font/woff2' || mime === 'application/font-woff2') return 'font/woff2'
    if (mime === 'font/ttf'   || mime === 'application/x-font-ttf') return 'font/ttf'
    if (mime === 'font/otf'   || mime === 'application/x-font-otf') return 'font/otf'
    // Fallback by extension
    const lower = file.name.toLowerCase()
    if (lower.endsWith('.woff2')) return 'font/woff2'
    if (lower.endsWith('.otf'))   return 'font/otf'
    return 'font/ttf'
  }
}
