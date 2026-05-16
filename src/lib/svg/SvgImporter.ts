// ── SvgImporter ───────────────────────────────────────────────────────────────
//
// Top-level orchestrator for SVG → Chorono import. Composes the parsers and
// converters into a single `import(svgText, options)` call.
//
// Architecture:
//   SvgDomParser           → SVGSVGElement
//   SvgViewBoxNormalizer   → SvgRootContext (root Matrix2D + final size)
//   SvgNodeConverter       → Layer[] + warnings
//
// All dependencies are injected via the constructor so they can be swapped
// out in tests / future runtime backends.

import type { SvgImportOptions, SvgImportResult } from '@/lib/types/svg'
import { SvgDomParser, SvgImportError } from './SvgDomParser'
import { SvgViewBoxNormalizer } from './SvgViewBoxNormalizer'
import { SvgNodeConverter } from './SvgNodeConverter'

export class SvgImporter {
  constructor(
    private domParser:      SvgDomParser           = new SvgDomParser(),
    private viewBoxNorm:    SvgViewBoxNormalizer   = new SvgViewBoxNormalizer(),
    private nodeConverter:  SvgNodeConverter       = new SvgNodeConverter(),
  ) {}

  /**
   * Imports an SVG string and returns Chorono layers + warnings.
   * Throws SvgImportError on fatal failures (malformed XML, missing <svg>).
   */
  import(svgText: string, options: SvgImportOptions = {}): SvgImportResult {
    const svg     = this.domParser.parse(svgText)
    const rootCtx = this.viewBoxNorm.createContext(svg, { scale: options.scale })
    return this.nodeConverter.convertDocument(svg, rootCtx, options)
  }
}

export { SvgImportError }

/** Default instance — most callers can use this. */
export const svgImporter = new SvgImporter()
