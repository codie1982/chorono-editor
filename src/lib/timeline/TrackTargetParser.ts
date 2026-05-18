// ── TrackTargetParser (BL-59) ─────────────────────────────────────────────────
//
// Parses and rebuilds Track.target strings. Used by clone/array commands to
// safely remap track targets when a cloned layer needs its own animation
// tracks (rather than sharing the source's).
//
// Track.target format (from src/lib/types/core.ts):
//   layers.{id}.{propertyPath}     — most common (e.g. "layers.card.opacity")
//   modifiers.{id}.{propertyPath}  — future (effects modifier props)
//   effects.{id}.{propertyPath}    — future (plugin effect params)
//   markers.{id}                   — future (event marker time)
//
// PropertyPath examples:
//   opacity
//   transform.x
//   transform.scaleY
//   style.fill
//   pathStroke.trim.offset

import type { ParsedTrackTarget } from './TrackTargetParserTypes'

const KNOWN_ENTITY_TYPES = ['layers', 'modifiers', 'effects', 'markers'] as const
type EntityNamespace = (typeof KNOWN_ENTITY_TYPES)[number]

function namespaceToType(ns: EntityNamespace): ParsedTrackTarget['entityType'] {
  switch (ns) {
    case 'layers':    return 'layer'
    case 'modifiers': return 'modifier'
    case 'effects':   return 'effect'
    case 'markers':   return 'marker'
  }
}

function typeToNamespace(t: ParsedTrackTarget['entityType']): EntityNamespace {
  switch (t) {
    case 'layer':    return 'layers'
    case 'modifier': return 'modifiers'
    case 'effect':   return 'effects'
    case 'marker':   return 'markers'
  }
}

/**
 * Parse a track target string into its semantic parts.
 *
 * @returns ParsedTrackTarget, or `null` if the format is unrecognised
 *          (in which case callers should leave the target untouched —
 *          NOT remap it blindly).
 *
 * @example
 *   parseTrackTarget("layers.card.transform.x")
 *   // → { entityType: 'layer', entityId: 'card', propertyPath: 'transform.x' }
 */
export function parseTrackTarget(target: string): ParsedTrackTarget | null {
  const parts = target.split('.')
  if (parts.length < 2) return null

  const ns = parts[0] as EntityNamespace
  if (!KNOWN_ENTITY_TYPES.includes(ns)) return null

  const entityId = parts[1]
  if (!entityId) return null

  const propertyPath = parts.slice(2).join('.')

  return {
    entityType: namespaceToType(ns),
    entityId,
    propertyPath,
  }
}

/**
 * Reverse of parseTrackTarget — build the target string from its parts.
 */
export function rebuildTrackTarget(parsed: ParsedTrackTarget): string {
  const ns = typeToNamespace(parsed.entityType)
  return parsed.propertyPath
    ? `${ns}.${parsed.entityId}.${parsed.propertyPath}`
    : `${ns}.${parsed.entityId}`
}

/**
 * Remap a track target's entity id via an idMap.
 *
 * If the parsed entityId is in the idMap, returns the rebuilt target
 * with the new id. Otherwise returns the input target unchanged.
 *
 * Unparseable targets (returns `null` from parseTrackTarget) are passed
 * through verbatim so we never destroy data we don't understand.
 *
 * @example
 *   remapTrackTarget(
 *     "layers.card_1.opacity",
 *     { "card_1": "card_2" }
 *   )
 *   // → "layers.card_2.opacity"
 */
export function remapTrackTarget(
  target: string,
  idMap: Record<string, string>,
): string {
  const parsed = parseTrackTarget(target)
  if (!parsed) return target

  const newId = idMap[parsed.entityId]
  if (!newId) return target

  return rebuildTrackTarget({ ...parsed, entityId: newId })
}

/**
 * Convenience: does the parsed target reference the given layer id?
 * Used by clone commands to find all tracks belonging to a source layer.
 */
export function targetsLayer(target: string, layerId: string): boolean {
  const parsed = parseTrackTarget(target)
  return parsed?.entityType === 'layer' && parsed.entityId === layerId
}
