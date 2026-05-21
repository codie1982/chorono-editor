// ── SvgDocumentHandler ────────────────────────────────────────────────────────
//
// Wraps the existing SvgImporter pipeline to make it work within the universal
// ImportManager. One SVG → potentially many path/shape layers + one SvgAsset.
//
// Architecture:
//   File → text → SvgImporter.import() → Layer[] + warnings
//   + SvgAsset (the original file stored as reference)

import { BaseImportHandler }            from '../BaseHandler'
import { svgImporter, SvgImportError }  from '../../../svg/SvgImporter'
import type {
  ImportFormat,
  ImportOptions,
  ImportResult,
  ImportPreflight,
  ImportProgress,
  ImportWarning,
  SvgImportOptions as PipelineSvgOptions,
} from '../../types'
import type { Asset } from '../../../asset/types'

// ── Helper ─────────────────────────────────────────────────────────────────────

/** Quick DOM-free scan to estimate path count before full import */
function estimatePathCount(svgText: string): number {
  return (svgText.match(/<path\b/gi) ?? []).length
    + (svgText.match(/<rect\b/gi) ?? []).length
    + (svgText.match(/<circle\b/gi) ?? []).length
    + (svgText.match(/<ellipse\b/gi) ?? []).length
    + (svgText.match(/<polygon\b/gi) ?? []).length
    + (svgText.match(/<polyline\b/gi) ?? []).length
}

function svgDimensions(svgText: string): { width: number; height: number } {
  const wMatch = svgText.match(/\bwidth=["']([0-9.]+)["']/)
  const hMatch = svgText.match(/\bheight=["']([0-9.]+)["']/)
  return {
    width:  wMatch ? parseFloat(wMatch[1]) : 0,
    height: hMatch ? parseFloat(hMatch[1]) : 0,
  }
}

// ── Handler ────────────────────────────────────────────────────────────────────

export class SvgDocumentHandler extends BaseImportHandler {
  readonly kind = 'document' as const
  readonly supportedFormats: ImportFormat[] = ['image/svg+xml']

  async preflight(file: File, options?: ImportOptions): Promise<ImportPreflight> {
    const text        = await file.text()
    const source      = this.makeSource(file)
    const estimated   = estimatePathCount(text)
    const { width, height } = svgDimensions(text)
    const features: string[] = []
    if (width && height) features.push(`${Math.round(width)}×${Math.round(height)} px`)
    features.push(`~${estimated} path elements`)

    const unsupported: string[] = []
    if (text.includes('<text') || text.includes('<tspan'))    unsupported.push('Text elements (skipped)')
    if (text.includes('<filter'))                              unsupported.push('SVG filters (skipped)')
    if (text.includes('<use'))                                 unsupported.push('<use> references (partially supported)')
    if (text.includes('<clipPath') || text.includes('<mask')) unsupported.push('Clip-paths / masks (simplified)')

    const warnings: string[] = []
    if (estimated > 5_000) warnings.push(`Large SVG with ~${estimated} elements — import may be slow`)
    if (file.size > 5_000_000) warnings.push('Large file — consider simplifying before import')

    return {
      source,
      format:  'image/svg+xml',
      kind:    'document',
      summary: {
        estimatedLayers:      estimated,
        estimatedAssets:      1,
        estimatedGroups:      1,
        estimatedTracks:      0,
        estimatedMemoryBytes: text.length * 2 + estimated * 512,
        detectedFeatures:     features,
        unsupportedFeatures:  unsupported,
      },
      availableOptions: {
        scale:            true,
        flattenGroups:    true,
        simplifyPaths:    true,
        convertTextToPath: false,
        collection:        true,
      },
      defaultOptions: { centerInComposition: false },
      warnings,
    }
  }

  async handle(
    file: File,
    options?: ImportOptions,
    onProgress?: (p: ImportProgress) => void,
  ): Promise<ImportResult> {
    const startMs = Date.now()
    this.reportProgress(onProgress, 'reading', 'Reading SVG…', 0.1)

    let text: string
    try {
      text = await file.text()
    } catch (err) {
      throw new Error(`Cannot read SVG file "${file.name}": ${(err as Error).message}`)
    }

    this.reportProgress(onProgress, 'parsing', 'Parsing SVG document…', 0.3)

    // Map pipeline options → SvgImporter options
    const svgOpts = this.buildSvgOptions(options as PipelineSvgOptions | undefined)

    let svgResult: Awaited<ReturnType<typeof svgImporter.import>>
    try {
      svgResult = svgImporter.import(text, svgOpts)
    } catch (err) {
      if (err instanceof SvgImportError) {
        throw new Error(`SVG import failed: ${err.message}`)
      }
      throw err
    }

    this.reportProgress(onProgress, 'converting', 'Creating layers…', 0.75)

    const { layers, width, height, warnings: svgWarnings } = svgResult

    // Create an SVG asset as reference (stores original file URL)
    const url     = URL.createObjectURL(file)
    const assetId = this.generateAssetId()

    const asset: Asset = {
      id:     assetId,
      name:   file.name.replace(/\.svg$/i, ''),
      type:   'svg',
      url,
      width:  width  || 0,
      height: height || 0,
      storage:  { mode: 'external', originalFileName: file.name },
      metadata: {
        filesize:   file.size,
        importedAt: Date.now(),
        tags:       [],
        notes:      `${layers.length} layer${layers.length !== 1 ? 's' : ''} imported`,
      },
      runtime: { objectUrl: url },
    }

    // Convert SvgImportWarnings → ImportWarnings
    const warnings: ImportWarning[] = svgWarnings.map(w => ({
      code:     'unsupported_feature' as const,
      severity: 'warning' as const,
      message:  w.message,
    }))

    if (layers.length === 0) {
      warnings.push({
        code:     'unsupported_feature',
        severity: 'warning',
        message:  'No renderable elements found in SVG — document may be empty or unsupported',
      })
    }

    this.reportProgress(onProgress, 'complete', 'Done', 1)

    const unsupportedFeatures = svgWarnings
      .filter(w => w.code !== 'EMPTY_DOCUMENT')
      .map(w => ({
        feature:     w.nodeName ?? w.code,
        description: w.message,
        fallback:    'skipped' as const,
      }))

    return {
      id:      this.generateId(),
      source:  this.makeSource(file),
      format:  'image/svg+xml',
      kind:    'document',
      assets:  [asset],
      layers,
      groups:  [],
      tracks:  [],
      timelines: [],
      commands:  [],
      warnings,
      errors:             [],
      unsupportedFeatures,
      report: {
        title:          'SVG Import',
        sourceFileName: file.name,
        format:         'image/svg+xml',
        created: {
          assets:       1,
          layers:       layers.length,
          groups:       0,
          tracks:       0,
          compositions: 0,
        },
        warnings:            warnings.map(w => ({ ...w, affectedIds: [] })),
        errors:              [],
        unsupportedFeatures,
        suggestions: layers.length > 100
          ? ['Consider using "Flatten Groups" option for simpler SVGs with many paths']
          : [],
        durationMs: Date.now() - startMs,
      },
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private buildSvgOptions(opts?: PipelineSvgOptions): import('../../../types/svg').SvgImportOptions {
    return {
      scale:        opts?.scale,
      flattenSingle: !(opts?.preserveGroups),
      maxLayers:    50_000, // safety cap
    }
  }
}
