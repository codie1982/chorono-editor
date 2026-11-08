// ── SvgDocumentHandler ────────────────────────────────────────────────────────
//
// Wraps the existing SvgImporter pipeline to make it work within the universal
// ImportManager. One SVG → potentially many path/shape layers + one SvgAsset.
//
// Architecture:
//   File → text → SvgImporter.import() → Layer[] + warnings
//   + SvgAsset (the original file stored as reference)

import { BoundedTextReader, type TextInputReader } from '../../../resources/io'
import { checkImportExecution, type ImportExecution } from '../../resources/ImportExecution'
import { withImportSource } from '../../resources/importSources'
import { BaseImportHandler }            from '../BaseHandler'
import { svgImporter, SvgImportError }  from '../../../svg/SvgImporter'
import { svgSanitizer, SvgSanitizer }   from '../../security/SvgSanitizer'
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
  const elements = /<(?:path|rect|circle|ellipse|polygon|polyline)\b/gi
  let count = 0
  while (elements.exec(svgText)) count++
  return count
}

/** Approximate width/height attributes for preflight; full viewBox conversion is downstream. */
function svgDimensions(svgText: string): { width: number; height: number } {
  const wMatch = svgText.match(/\bwidth=["']([0-9.]+)["']/)
  const hMatch = svgText.match(/\bheight=["']([0-9.]+)["']/)
  return {
    width:  wMatch ? parseFloat(wMatch[1]) : 0,
    height: hMatch ? parseFloat(hMatch[1]) : 0,
  }
}

// ── Handler ────────────────────────────────────────────────────────────────────

/** SVG import orchestration. Borrows a bounded text scope through sanitizer,
 * DOM conversion and source creation; default 16 MiB actual input, four UTF-16
 * text representations for sanitizer original/intermediate/replacement overlap.
 * DOM/native/parsed layer memory is not an exact text-budget measurement. */
export class SvgDocumentHandler extends BaseImportHandler {
  readonly kind = 'document' as const
  readonly supportedFormats: ImportFormat[] = ['image/svg+xml']

  /** The application injects its shared-budget reader; private hosts retain finite limits. */
  constructor(private readonly textReader: TextInputReader = new BoundedTextReader({ maxInputBytes: 16 * 1024 ** 2 })) { super() }

  /** Count approximate shapes without DOM allocation; text ownership spans the scan. */
  async preflight(file: File, options?: ImportOptions, execution?: ImportExecution): Promise<ImportPreflight> {
    return this.textReader.withBlob(file, text => {
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
    }, { ...execution, label: 'SVG preflight text' })
  }

  /** Convert admitted source to independently owned result data; manager owns final publication checks. */
  async handle(
    file: File,
    options?: ImportOptions,
    onProgress?: (p: ImportProgress) => void,
    execution?: ImportExecution,
  ): Promise<ImportResult> {
    const startMs = Date.now()
    this.reportProgress(onProgress, 'reading', 'Reading SVG…', 0.1)

    return this.textReader.withBlob(file, async rawText => {
      // ── Security: strip scripts / external refs / XXE before parsing (BL-08) ──
      const sanitized = svgSanitizer.sanitize(rawText)
      const text = sanitized.svg
      const securityWarnings: ImportWarning[] = SvgSanitizer.wasModified(sanitized.report)
        ? sanitized.warnings.map(message => ({
            code:     'external_reference_skipped' as const,
            severity: 'warning' as const,
            message:  `Security: ${message}`,
          }))
        : []

      this.reportProgress(onProgress, 'parsing', 'Parsing SVG document…', 0.3)
      checkImportExecution(execution)

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
      checkImportExecution(execution)

      const { layers, width, height, warnings: svgWarnings } = svgResult

      // Create an SVG asset as reference. Store the SANITIZED text (not the raw
      // file) so the library preview / blob URL can never carry active content.
      const sanitizedBlob = new Blob([text], { type: 'image/svg+xml' })
      return withImportSource(sanitizedBlob, async (url) => {
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

        // Convert SvgImportWarnings → ImportWarnings, prefixed by any security findings
        const warnings: ImportWarning[] = [
          ...securityWarnings,
          ...svgWarnings.map(w => ({
            code:     'unsupported_feature' as const,
            severity: 'warning' as const,
            message:  w.message,
          })),
        ]

        if (layers.length === 0) {
          warnings.push({
            code:     'unsupported_feature',
            severity: 'warning',
            message:  'No renderable elements found in SVG — document may be empty or unsupported',
          })
        }

        this.reportProgress(onProgress, 'complete', 'Done', 1)
        checkImportExecution(execution)

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
      })
    }, { ...execution, copies: 4, label: 'SVG sanitizer text' })
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /** Preserve existing scale/group mapping and 50,000 converted-layer safety limit. */
  private buildSvgOptions(opts?: PipelineSvgOptions): import('../../../types/svg').SvgImportOptions {
    return {
      scale:        opts?.scale,
      flattenSingle: !(opts?.preserveGroups),
      maxLayers:    50_000, // safety cap
    }
  }
}
