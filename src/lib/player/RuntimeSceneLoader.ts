// ── RuntimeSceneLoader ────────────────────────────────────────────────────────
//
// Prepares a ChronoScene for playback. Currently this reconciles the scene's
// state-machine definitions into live StateMachineRuntime instances (the same
// reconciliation useSMRuntime does in the editor, minus React). Kept separate
// from ChronoPlayer so loading a runtime bundle (.chrb / RuntimeAnimation JSON →
// ChronoScene) can grow here without touching the player loop.

import type { ChronoScene } from '@/lib/types'
import { StateMachineRuntime } from '@/lib/statemachine'

/**
 * Build or update StateMachineRuntime instances to match the scene's machine
 * definitions. Passing the previous map preserves live currentState across a
 * reload while picking up structural changes.
 */
export function reconcileStateMachines(
  scene: ChronoScene,
  existing?: Map<string, StateMachineRuntime>,
): Map<string, StateMachineRuntime> {
  const map = existing ?? new Map<string, StateMachineRuntime>()
  const seen = new Set<string>()

  for (const def of scene.stateMachines ?? []) {
    seen.add(def.id)
    const current = map.get(def.id)
    if (current) current.sync(def)
    else map.set(def.id, new StateMachineRuntime(def))
  }

  for (const id of Array.from(map.keys())) {
    if (!seen.has(id)) map.delete(id)
  }
  return map
}
