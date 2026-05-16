// ── SvgDomParser ──────────────────────────────────────────────────────────────
//
// Thin wrapper around the browser DOMParser. Parses an SVG text string to an
// SVGSVGElement, validates it, and reports clear errors.
//
// Browser-only: DOMParser is not available in Node. Server-side imports of
// this module will throw; SVG import happens in the editor (client).

export class SvgImportError extends Error {
  constructor(message: string, public readonly source?: string) {
    super(message)
    this.name = 'SvgImportError'
  }
}

export class SvgDomParser {
  /**
   * Parses SVG text and returns the root <svg> element.
   * Throws SvgImportError on any failure (malformed XML, missing <svg> root,
   * parser error markers).
   */
  parse(svgText: string): SVGSVGElement {
    if (typeof DOMParser === 'undefined') {
      throw new SvgImportError(
        'SvgDomParser requires a browser DOMParser (not available in this environment)',
      )
    }

    const trimmed = svgText.trim()
    if (trimmed.length === 0) {
      throw new SvgImportError('Empty SVG document')
    }

    const parser = new DOMParser()
    const doc    = parser.parseFromString(trimmed, 'image/svg+xml')

    // Browsers emit a <parsererror> child instead of throwing.
    const errorEl = doc.querySelector('parsererror')
    if (errorEl) {
      throw new SvgImportError(`SVG parse error: ${errorEl.textContent ?? 'unknown'}`)
    }

    const svg = doc.documentElement
    if (!svg || svg.tagName.toLowerCase() !== 'svg') {
      throw new SvgImportError(`Expected <svg> root element, got <${svg?.tagName ?? 'null'}>`)
    }

    return svg as unknown as SVGSVGElement
  }
}
