// ── CapabilityContext ─────────────────────────────────────────────────────────
// Auto-discovers all layer types and their animatable properties from the
// LayerRegistry, then formats them as LLM-readable reference text.
//
// Why: hard-coded property lists in tools.ts drift as the editor grows. The
// registry is the source of truth — we read from it on every request.

import { layerRegistry } from '@/lib/registry'

export interface CapabilitySummary {
  /** All layer kinds grouped by category */
  layerCatalog: string
  /** All animatable property paths across all layer types */
  animatableProps: string
}

/**
 * Build a complete capability reference for the AI to consult before
 * deciding what tools to call. Output is concise plain text suitable for
 * inclusion in the system prompt.
 */
export function buildCapabilityContext(): CapabilitySummary {
  const defs = layerRegistry.getAll()

  // ── Layer catalog grouped by category ──────────────────────────────────────
  const catalogByCategory = new Map<string, string[]>()
  for (const def of defs) {
    const list = catalogByCategory.get(def.category) ?? []
    list.push(`    • ${def.kind} — ${def.label}`)
    catalogByCategory.set(def.category, list)
  }
  const catalogLines: string[] = []
  const categories = Array.from(catalogByCategory.keys()).sort()
  for (const cat of categories) {
    catalogLines.push(`  ${cat}:`)
    catalogLines.push(...(catalogByCategory.get(cat) ?? []))
  }
  const layerCatalog = catalogLines.join('\n')

  // ── Animatable properties (deduped across layer kinds) ─────────────────────
  // Each schema's path is the dot-notation target used in add_keyframes.
  const propByPath = new Map<string, { types: Set<string>; valueType: string; label: string }>()

  for (const def of defs) {
    try {
      const sample = def.createDefault()
      const groups = def.getPropertyGroups(sample)
      for (const group of groups) {
        for (const schema of group.schemas) {
          if (!schema.animatable) continue
          const entry = propByPath.get(schema.path) ?? {
            types: new Set<string>(),
            valueType: schema.valueType,
            label: schema.label,
          }
          entry.types.add(def.kind)
          propByPath.set(schema.path, entry)
        }
      }
    } catch {
      // Definition can't construct a default — skip silently.
      // Happens for media types that require an asset.
    }
  }

  const propPaths = Array.from(propByPath.keys()).sort()
  const animatableLines: string[] = []
  for (const path of propPaths) {
    const entry = propByPath.get(path)!
    const range = valueTypeHint(entry.valueType)
    animatableLines.push(`    • ${path} (${entry.valueType}${range ? `, ${range}` : ''}) — ${entry.label}`)
  }
  const animatableProps = animatableLines.join('\n')

  return { layerCatalog, animatableProps }
}

function valueTypeHint(valueType: string): string {
  switch (valueType) {
    case 'percent': return '0–1'
    case 'angle':   return 'degrees'
    case 'color':   return '"#rrggbb" — SNAPS, no smooth interpolation'
    case 'number':  return 'numeric'
    case 'boolean': return 'true/false'
    default:        return ''
  }
}
