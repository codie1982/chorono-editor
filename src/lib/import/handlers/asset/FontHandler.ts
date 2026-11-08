// ── FontHandler ────────────────────────────────────────────────────────────────
//
// Handles WOFF2, TTF, OTF font imports.
// Creates one FontAsset (no layer — fonts are applied to text layers via name).
// Validates through the shared bounded font service; registration has an owner.

import { withImportSource } from '../../resources/importSources'
import { BaseImportHandler } from '../BaseHandler'
import type { ImportFormat, ImportOptions, ImportResult, ImportPreflight, ImportProgress } from '../../types'
import type { Asset } from '../../../asset/types'
import {fontAssetService,importedFontNames,FontRegistrationUnavailable} from '../../../asset/fonts'
import {checkImportExecution,type ImportExecution} from '../../resources/ImportExecution'

/** Convert an imported source to the existing font asset schema and validate
 * native readability with a temporary managed pin. No unowned FontFace is
 * inserted into document.fonts. Only expected native compatibility failures
 * preserve warnings; malformed input, budgets, abort and deadline stay fatal. */
export class FontHandler extends BaseImportHandler {
  readonly kind = 'asset' as const
  readonly supportedFormats: ImportFormat[] = [
    'font/woff',
    'font/woff2',
    'font/ttf',
    'font/otf',
  ]

  /** Scalar preflight is cheap; full actual-byte/container validation happens
   * inside the shared font queue during handle, before FontFace construction. */
  async preflight(file: File, _options?: ImportOptions, execution?: ImportExecution): Promise<ImportPreflight> {
    checkImportExecution(execution)
    if(file.size>32*1024**2)throw new RangeError('Font source exceeds the 32 MiB input policy.')
    const source      = this.makeSource(file)
    const format      = this.getFormat(file)
    const displayName = importedFontNames(file.name,'preflight').name

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
    execution?: ImportExecution,
  ): Promise<ImportResult> {
    checkImportExecution(execution)
    const startMs     = Date.now()
    const assetId=this.generateAssetId()
    const {name:displayName,family:familyName}=importedFontNames(file.name,assetId)

    this.reportProgress(onProgress, 'reading', 'Loading font…', 0.2)

    return withImportSource(file, async (url) => {
      const format  = this.getFormat(file)
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

      const warnings:ImportResult['warnings']=[]
      try {const lease=await fontAssetService.acquire(asset,{signal:execution?.signal});lease.release()}
      catch(error) {if(!(error instanceof FontRegistrationUnavailable))throw error
        warnings.push({code:'unsupported_feature',severity:'warning',message:`Could not register font "${displayName}" — it may not render in text layers`})}
      checkImportExecution(execution)
      this.reportProgress(onProgress,'converting','Preparing font asset…',0.8)

      this.reportProgress(onProgress, 'complete', 'Done', 1)
      checkImportExecution(execution)

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
    })
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private getFormat(file: File): ImportFormat {
    const mime = file.type.toLowerCase()
    if (mime === 'font/woff' || mime === 'application/font-woff') return 'font/woff'
    if (mime === 'font/woff2' || mime === 'application/font-woff2') return 'font/woff2'
    if (mime === 'font/ttf'   || mime === 'application/x-font-ttf') return 'font/ttf'
    if (mime === 'font/otf'   || mime === 'application/x-font-otf') return 'font/otf'
    // Fallback by extension
    const lower = file.name.toLowerCase()
    if (lower.endsWith('.woff')) return 'font/woff'
    if (lower.endsWith('.woff2')) return 'font/woff2'
    if (lower.endsWith('.otf'))   return 'font/otf'
    return 'font/ttf'
  }
}
