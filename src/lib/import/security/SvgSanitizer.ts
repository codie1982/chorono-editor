// ── SvgSanitizer ──────────────────────────────────────────────────────────────
//
// String-based defense-in-depth pre-filter applied to SVG text BEFORE it is
// parsed into the DOM and converted to Chorono layers (BL-08 security).
//
// Chorono's SvgImporter only extracts path/shape geometry, and SVG assets are
// previewed via <img src> (which browsers run in a non-scripted context). This
// sanitizer is an additional safety layer that strips active content so a
// malicious SVG can never execute script, exfiltrate via external refs, or
// trigger XML entity attacks — regardless of how the cleaned SVG is later used.
//
// It runs in plain Node (no DOMParser dependency) so it is unit-testable and
// can also run in a Web Worker.

export interface SvgSanitizeReport {
  /** Number of <script> blocks removed. */
  scripts: number
  /** Number of inline event-handler attributes (on*) removed. */
  eventHandlers: number
  /** Number of <foreignObject> blocks removed. */
  foreignObjects: number
  /** Number of external/javascript: references neutralized. */
  externalRefs: number
  /** Whether a DOCTYPE/ENTITY declaration was stripped. */
  strippedDoctype: boolean
}

export interface SvgSanitizeResult {
  /** Cleaned SVG text. */
  svg: string
  /** What was changed. */
  report: SvgSanitizeReport
  /** Human-readable warnings (empty if nothing was removed). */
  warnings: string[]
}

// ── Patterns ────────────────────────────────────────────────────────────────────

// <script>…</script> (greedy-safe, case-insensitive, multiline)
const SCRIPT_RE = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi
// Self-closing or empty <script .../>
const SCRIPT_SELF_RE = /<script\b[^>]*\/>/gi
// <foreignObject>…</foreignObject> — can embed arbitrary HTML
const FOREIGN_RE = /<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject\s*>/gi
const FOREIGN_SELF_RE = /<foreignObject\b[^>]*\/>/gi
// Inline event handlers: onload="…", onclick='…', onmouseover=… (unquoted).
// Requires a single preceding whitespace so it only matches real attributes.
const EVENT_ATTR_RE = /\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi
// DOCTYPE / ENTITY declarations (XXE / billion-laughs)
const DOCTYPE_RE = /<!DOCTYPE[\s\S]*?>/gi
const ENTITY_RE  = /<!ENTITY[\s\S]*?>/gi
// javascript: URIs anywhere
const JS_URI_RE = /(href|xlink:href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi
// External absolute references in href/xlink:href/src (http, https, file, ftp).
// Local fragment refs (#id) and data: URIs are preserved.
const EXTERNAL_REF_RE = /(href|xlink:href|src)\s*=\s*("(?:https?|ftp|file):\/\/[^"]*"|'(?:https?|ftp|file):\/\/[^']*')/gi

// ── Sanitizer ─────────────────────────────────────────────────────────────────

export class SvgSanitizer {
  sanitize(svgText: string): SvgSanitizeResult {
    const report: SvgSanitizeReport = {
      scripts: 0, eventHandlers: 0, foreignObjects: 0, externalRefs: 0, strippedDoctype: false,
    }

    let out = svgText

    // 1. DOCTYPE / ENTITY (do first — removes XXE vectors). Compare before/after
    //    rather than .test() to avoid global-regex lastIndex statefulness.
    const beforeDoctype = out
    out = out.replace(DOCTYPE_RE, '').replace(ENTITY_RE, '')
    if (out !== beforeDoctype) report.strippedDoctype = true

    // 2. <script> blocks
    out = out.replace(SCRIPT_RE, () => { report.scripts++; return '' })
    out = out.replace(SCRIPT_SELF_RE, () => { report.scripts++; return '' })

    // 3. <foreignObject> blocks
    out = out.replace(FOREIGN_RE, () => { report.foreignObjects++; return '' })
    out = out.replace(FOREIGN_SELF_RE, () => { report.foreignObjects++; return '' })

    // 4. Inline event handlers
    out = out.replace(EVENT_ATTR_RE, () => { report.eventHandlers++; return '' })

    // 5. javascript: URIs
    out = out.replace(JS_URI_RE, () => { report.externalRefs++; return '' })

    // 6. External absolute references
    out = out.replace(EXTERNAL_REF_RE, () => { report.externalRefs++; return '' })

    const warnings = this.buildWarnings(report)
    return { svg: out, report, warnings }
  }

  /** True if anything was removed. */
  static wasModified(report: SvgSanitizeReport): boolean {
    return report.scripts > 0 || report.eventHandlers > 0 || report.foreignObjects > 0
      || report.externalRefs > 0 || report.strippedDoctype
  }

  private buildWarnings(r: SvgSanitizeReport): string[] {
    const w: string[] = []
    if (r.scripts > 0)        w.push(`Removed ${r.scripts} <script> block${r.scripts === 1 ? '' : 's'}`)
    if (r.eventHandlers > 0)  w.push(`Removed ${r.eventHandlers} inline event handler${r.eventHandlers === 1 ? '' : 's'}`)
    if (r.foreignObjects > 0) w.push(`Removed ${r.foreignObjects} <foreignObject> element${r.foreignObjects === 1 ? '' : 's'}`)
    if (r.externalRefs > 0)   w.push(`Neutralized ${r.externalRefs} external/script reference${r.externalRefs === 1 ? '' : 's'}`)
    if (r.strippedDoctype)    w.push('Removed DOCTYPE/ENTITY declaration (XML entity-attack protection)')
    return w
  }
}

/** Shared singleton. */
export const svgSanitizer = new SvgSanitizer()
