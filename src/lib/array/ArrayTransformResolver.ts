// ── ArrayTransformResolver (BL-59) ────────────────────────────────────────────
//
// Top-level dispatcher for the per-pattern solvers. Pure math — returns
// ArrayInstanceTransform[] (NOT Layers). The factory (ArrayLayerFactory)
// turns these transforms into real layers; the Preview overlay renders
// them as ghosts WITHOUT allocating layers.
//
// This separation is the v2 architecture's most important payoff: one
// math implementation, multiple consumers (commands, preview, AI tools,
// future Repeater Modifier).

import type { Layer } from '../types'
import type {
  ArraySettings,
  ArrayInstanceTransform,
} from './ArrayTypes'
import { solveLinear } from './LinearArraySolver'
import { solveGrid } from './GridArraySolver'
import { solveRadial } from './RadialArraySolver'
import { solvePathArray } from './PathArraySolver'

/**
 * Compute per-instance transforms for an array operation.
 *
 * Pure function: no scene mutation, no layer creation. The result is
 * an array of plain transform records that downstream consumers can
 * turn into layers (factory) or render as ghosts (preview).
 *
 * @example
 *   const transforms = resolveArrayTransforms(rect, {
 *     pattern: 'linear',
 *     count: 5,
 *     move: { x: 50, y: 0 },
 *     // ... other base fields
 *   })
 *   // transforms.length === 5
 *   // transforms[0].isSourceIndex === true  (if sourcePolicy='include-source')
 */
export function resolveArrayTransforms(
  source: Layer,
  settings: ArraySettings,
  allLayers: Layer[] = [],
): ArrayInstanceTransform[] {
  switch (settings.pattern) {
    case 'linear':
      return solveLinear(source, settings)
    case 'grid':
      return solveGrid(source, settings)
    case 'radial':
      return solveRadial(source, settings)
    case 'path':
      return solvePathArray(source, settings, allLayers)
  }
}

/**
 * Total instance count produced by the given settings, without doing
 * the math. Useful for UI ("5 copies will be created") and for Preview
 * level-of-detail decisions (">500 → wireframe mode").
 */
export function countArrayInstances(settings: ArraySettings): number {
  switch (settings.pattern) {
    case 'linear':
    case 'radial':
    case 'path':
      return Math.max(0, settings.count)
    case 'grid':
      return Math.max(0, settings.columns) * Math.max(0, settings.rows)
  }
}

/**
 * Number of NEW layers a given array settings would create (i.e. excludes
 * the source when sourcePolicy='include-source').
 */
export function countNewClones(settings: ArraySettings): number {
  const total = countArrayInstances(settings)
  if (settings.sourcePolicy === 'include-source') {
    return Math.max(0, total - 1)
  }
  return total
}
