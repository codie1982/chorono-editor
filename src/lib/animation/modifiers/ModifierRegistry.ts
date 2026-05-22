// ── ModifierRegistry ──────────────────────────────────────────────────────────
//
// Plugin registry for curve modifiers (BL-46..49). Mirrors EffectRegistry:
// each modifier is a plugin keyed by `type`, exposing a pure evaluator plus
// its default parameter set. Adding a modifier kind = one new plugin +
// register() — no central switch to edit.
//
// Pipeline calls evaluate(); the UI/tests call defaultParameters().

import type { CurveModifier, CurveModifierContext, CurveModifierType } from './types'

export interface ModifierPlugin {
  type: CurveModifierType
  /** Pure: (ctx, modifier) → the modifier's raw output (pre-blend). */
  evaluate(ctx: CurveModifierContext, m: CurveModifier): number
  /** Sensible starting parameters when a fresh modifier is added from the UI. */
  defaultParameters(): CurveModifier['parameters']
}

export class ModifierRegistry {
  private byType = new Map<CurveModifierType, ModifierPlugin>()

  register(plugin: ModifierPlugin): void {
    if (this.byType.has(plugin.type)) {
      throw new Error(`ModifierRegistry: type "${plugin.type}" already registered`)
    }
    this.byType.set(plugin.type, plugin)
  }

  get(type: CurveModifierType): ModifierPlugin | undefined {
    return this.byType.get(type)
  }

  clear(): void { this.byType.clear() }
}

export const modifierRegistry = new ModifierRegistry()
