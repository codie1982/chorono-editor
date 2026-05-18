/**
 * BL-57 — Faceted search query parser
 *
 * Compact, dependency-free query language for the Scene Explorer search
 * input. Tokens are whitespace-separated; each token is either a key:value
 * facet, a negation prefix (`-`), or a bare substring.
 *
 * Examples:
 *   button                              → name/type substring "button"
 *   type:shape                          → only shape layers
 *   type:shape has:keyframes            → AND
 *   type:shape -is:hidden               → shapes that are NOT hidden
 *   name:logo type:text                 → text layers with "logo" in name
 *
 * Design choices:
 *   - Tokens within a query are AND-ed (Figma / Linear / GitHub convention).
 *   - No OR / grouping / quoted-string support yet — keep the grammar
 *     simple, extend when there's real demand.
 *   - When parsing fails midway (e.g. `type:` with no value), the
 *     offending token degrades to a substring match instead of erroring.
 *     The user keeps typing and the search keeps working.
 */

import type { Layer } from '@/lib/types'

// ── Facet vocabulary ────────────────────────────────────────────────────────
//
// Centralised here so the autocomplete UI can reflect exactly what the
// evaluator supports (no drift between hint and behaviour).

export type FacetKey = 'type' | 'has' | 'is' | 'name' | 'color' | 'parent'

export interface FacetValueSpec {
  /** Human-readable label for the suggestion dropdown. */
  label: string
  /** Optional one-line description shown beneath the value. */
  description?: string
}

/** Static value catalogue used to power autocomplete. `dynamic` facets
 *  (name / parent / color) pull suggestions from the live scene instead. */
export const FACET_VALUES: Partial<Record<FacetKey, Record<string, FacetValueSpec>>> = {
  type: {
    shape:      { label: 'shape',      description: 'Rectangles, circles, polygons, …' },
    text:       { label: 'text',       description: 'Text layers' },
    image:      { label: 'image' },
    video:      { label: 'video' },
    audio:      { label: 'audio' },
    path:       { label: 'path',       description: 'Bezier paths' },
    pathStroke: { label: 'pathStroke', description: 'Path stroke / motion path layers' },
    group:      { label: 'group' },
    repeater:   { label: 'repeater' },
  },
  has: {
    keyframes:   { label: 'keyframes',   description: 'Layer has at least one animated track' },
    modifiers:   { label: 'modifiers',   description: 'Layer has effects / plugin effects' },
    constraints: { label: 'constraints', description: 'Layer has followPath / motionPath' },
    masks:       { label: 'masks',       description: 'Layer has a mask' },
  },
  is: {
    locked:   { label: 'locked' },
    hidden:   { label: 'hidden' },
    solo:     { label: 'solo' },
    pinned:   { label: 'pinned' },
    frozen:   { label: 'frozen' },
    animated: { label: 'animated', description: 'Has at least one keyframe track' },
  },
}

export const FACET_KEYS: FacetKey[] = ['type', 'has', 'is', 'name', 'color', 'parent']

// ── AST ─────────────────────────────────────────────────────────────────────

export interface SearchTerm {
  /** Negation flag — `-is:hidden` becomes { negated: true, … }. */
  negated: boolean
  /** When facet === undefined the term is a bare substring (name/type match). */
  facet?: FacetKey
  /** Lowercased value for case-insensitive comparison. Empty for invalid
   *  bare-key tokens like `type:`. */
  value:  string
  /** Original raw token — kept for diagnostics + suggestion highlighting. */
  raw:    string
}

export interface SearchQuery {
  terms:   SearchTerm[]
  isEmpty: boolean
}

// ── Parser ──────────────────────────────────────────────────────────────────

export function parseSearchQuery(input: string): SearchQuery {
  const trimmed = input.trim()
  if (!trimmed) return { terms: [], isEmpty: true }

  const tokens = trimmed.split(/\s+/)
  const terms: SearchTerm[] = []

  for (const raw of tokens) {
    let token = raw
    let negated = false
    if (token.startsWith('-') && token.length > 1) {
      negated = true
      token   = token.slice(1)
    }

    // facet?
    const colon = token.indexOf(':')
    if (colon > 0 && colon < token.length - 1) {
      const key   = token.slice(0, colon).toLowerCase()
      const value = token.slice(colon + 1).toLowerCase()
      if ((FACET_KEYS as string[]).includes(key)) {
        terms.push({ negated, facet: key as FacetKey, value, raw })
        continue
      }
      // Unknown facet — degrade to substring on the whole raw token so
      // the user still gets feedback. Negation stays in raw, ignored.
      terms.push({ negated: false, value: raw.toLowerCase(), raw })
      continue
    }

    // Bare substring
    terms.push({ negated, value: token.toLowerCase(), raw })
  }

  return { terms, isEmpty: terms.length === 0 }
}

// ── Suggestion-time helpers (consumed by SearchSuggestions UI) ──────────────

/** What is the user currently typing? Inspect the trailing token to drive
 *  suggestions: bare → suggest facet keys; `key:` → suggest values; etc. */
export function classifyCursorToken(input: string): {
  /** The trailing token under the cursor (no trailing whitespace). */
  token: string
  /** When token contains `:`, the part before; otherwise undefined. */
  facetPrefix?: FacetKey
  /** Token's value-part when facetPrefix is set, '' otherwise. */
  valuePrefix: string
  /** When true the user is just starting a new token. */
  expectKey: boolean
} {
  // If the user just typed a space, the trailing token is empty —
  // expectKey === true so we suggest facet keys.
  if (input.endsWith(' ') || input.length === 0) {
    return { token: '', valuePrefix: '', expectKey: true }
  }
  const lastSpace = input.lastIndexOf(' ')
  const token = lastSpace === -1 ? input : input.slice(lastSpace + 1)
  const stripped = token.startsWith('-') ? token.slice(1) : token

  const colon = stripped.indexOf(':')
  if (colon > 0) {
    const key = stripped.slice(0, colon).toLowerCase()
    if ((FACET_KEYS as string[]).includes(key)) {
      return {
        token,
        facetPrefix: key as FacetKey,
        valuePrefix: stripped.slice(colon + 1).toLowerCase(),
        expectKey:   false,
      }
    }
  }
  return { token, valuePrefix: stripped.toLowerCase(), expectKey: true }
}

/** Replace the trailing token of `input` with `replacement`, preserving the
 *  rest of the query. Used when the user accepts an autocomplete suggestion. */
export function replaceCursorToken(input: string, replacement: string): string {
  if (input.endsWith(' ') || input.length === 0) return input + replacement + ' '
  const lastSpace = input.lastIndexOf(' ')
  const prefix = lastSpace === -1 ? '' : input.slice(0, lastSpace + 1)
  return prefix + replacement + ' '
}

/** Dynamic suggestion source: distinct color labels actually used in
 *  the scene, formatted for the `color:` facet. */
export function distinctColorLabels(layers: Layer[]): string[] {
  const set = new Set<string>()
  for (const l of layers) if (l.colorLabel) set.add(l.colorLabel.toLowerCase())
  return Array.from(set)
}

/** Dynamic suggestion source: distinct layer names / ids for `parent:`. */
export function distinctParentIds(layers: Layer[]): string[] {
  const set = new Set<string>()
  for (const l of layers) if (l.type === 'group') set.add(l.id)
  return Array.from(set)
}
