// ── Panel Registry ────────────────────────────────────────────────────────────
// Maps panel ids → { title, render }. Panels are rendered by the DockLayout
// according to the tree's leaf.panels list.

import type { ReactNode } from 'react'

export interface PanelDefinition {
  id: string
  title: string
  /** Render the panel's body — receives full viewport area (no chrome). */
  render: () => ReactNode
}

export type PanelRegistry = Map<string, PanelDefinition>

export function makeRegistry(defs: PanelDefinition[]): PanelRegistry {
  return new Map(defs.map((d) => [d.id, d]))
}
