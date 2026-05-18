// ── ParameterWire migration (BL-05) ───────────────────────────────────────────
// Translates legacy string-id wires ({ sourceParamId, targetParamId, ... }) to
// the new structured-ref schema ({ source: ParameterRef, target, ... }).
// Applied transparently at scene-load and by JSON import — no user action.

import type { ChronoScene, ParameterRef, ParameterWire } from '../types'
import { parseParamRef } from './helpers'

/** True if the wire shape looks like the pre-refactor legacy format. */
function isLegacyWire(w: unknown): w is { id: string; sourceParamId: string; targetParamId: string; expression: string; enabled: boolean } {
  return !!w
    && typeof w === 'object'
    && 'sourceParamId' in (w as Record<string, unknown>)
    && typeof (w as Record<string, unknown>).sourceParamId === 'string'
}

/** Convert a single legacy wire to the new schema. Unknown source/target paths
 *  produce best-effort refs (valueType defaults to 'number'). */
function migrateOne(w: ReturnType<typeof legacyShape>): ParameterWire {
  const now = Date.now()
  const source: ParameterRef = parseParamRef(w.sourceParamId)
    ?? { propertyPath: w.sourceParamId, valueType: 'number' }
  const target: ParameterRef = parseParamRef(w.targetParamId)
    ?? { propertyPath: w.targetParamId, valueType: 'number' }
  return {
    id: w.id,
    enabled: w.enabled,
    source,
    target,
    expression: w.expression,
    blendMode: 'override',
    createdAt: now,
    updatedAt: now,
  }
}

// type helper for the legacy shape so TS narrowing works in migrateOne
function legacyShape(): { id: string; sourceParamId: string; targetParamId: string; expression: string; enabled: boolean } {
  // Never called — exists only so migrateOne can refer to its return type.
  throw new Error('unreachable')
}

/** Walk a scene's parameterWires array and upgrade any legacy entries.
 *  Returns the same scene reference if nothing needed migrating, so React /
 *  change-detection skips a re-render. */
export function migrateSceneWires(scene: ChronoScene): ChronoScene {
  const wires = scene.parameterWires
  if (!wires || wires.length === 0) return scene
  let mutated = false
  const next: ParameterWire[] = wires.map((w) => {
    if (isLegacyWire(w)) {
      mutated = true
      return migrateOne(w)
    }
    return w as ParameterWire
  })
  if (!mutated) return scene
  return { ...scene, parameterWires: next }
}
