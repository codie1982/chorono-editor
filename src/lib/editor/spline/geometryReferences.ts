import type { ChronoScene } from '../../types'
import type { SplinePathData } from '../../types/spline'

/** Refuse deleting geometry IDs still read by semantic scene payloads. Source
 * geometry is scoped by layer and is validated separately; provenance records
 * are historical, not live references. Both qualified paths and relative spline
 * paths cover wire/expression/controller payloads, including muted definitions.
 * This deliberately rejects unsupported reference migration instead of guessing
 * a replacement target or removing human-authored expressions. */
export function assertSplineGeometryReferences(scene: ChronoScene, layerId: string, before: SplinePathData, after: SplinePathData): void {
  const prefixes: string[] = [], removedIds = new Set<string>()
  for (const family of ['points', 'handles', 'segments', 'contours', 'subShapes'] as const)
    for (const id of Object.keys(before[family])) if (!after[family][id]) { prefixes.push(`spline.${family}.${id}`); removedIds.add(id) }
  if (!prefixes.length) return
  const payload = { ...scene, authoring: undefined, layers: scene.layers.map(({ spline: _spline, ...layer }) => layer) }
  const visit = (value: unknown): boolean => {
    if (typeof value === 'string') return removedIds.has(value) || prefixes.some(prefix => value === prefix || value.startsWith(prefix + '.') || value.includes(`layers.${layerId}.${prefix}`))
    if (!value || typeof value !== 'object') return false
    return Object.entries(value).some(([key, item]) => visit(key) || visit(item))
  }
  if (visit(payload)) throw new Error('A wire, expression, controller or scene reference uses removed spline geometry. Keep that reference or explicitly convert it before editing topology.')
}
