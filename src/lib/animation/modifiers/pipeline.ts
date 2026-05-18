/** Modifier stack evaluation pipeline (BL-46).
 *
 *  Applies a list of CurveModifier in order to a base interpolated value.
 *  Each modifier produces its own raw output via evaluateModifier(); the
 *  output is then blended into currentValue using the modifier's
 *  blendMode + weight.
 *
 *  Pipeline shape:
 *      currentValue = baseValue
 *      for each enabled modifier:
 *          modValue = evaluateModifier(ctx with currentValue)
 *          currentValue = blend(currentValue, modValue, mode, weight)
 *      return currentValue
 *
 *  Disabled modifiers are skipped. weight=0 makes the modifier inert
 *  regardless of mode. The base value never changes mid-chain — only
 *  ctx.currentValue does, so modifiers that want the original are still
 *  able to read ctx.baseValue.
 */

import type { CurveModifier, CurveModifierContext, CurveBlendMode } from './types'
import { evaluateModifier } from './builtins'

export function blendModifierValue(
  currentValue:  number,
  modifierValue: number,
  blendMode:     CurveBlendMode,
  weight:        number,
): number {
  switch (blendMode) {
    case 'add':      return currentValue + modifierValue * weight
    case 'multiply': return currentValue * (1 + (modifierValue - 1) * weight)
    case 'replace':  return currentValue * (1 - weight) + modifierValue * weight
    case 'blend':    return currentValue + (modifierValue - currentValue) * weight
    default:         return currentValue
  }
}

/** Run a list of modifiers in order. Returns the final blended value.
 *  Modifies the passed ctx.currentValue field as it goes — caller should
 *  treat the returned number as the source of truth. */
export function applyModifiers(
  modifiers: CurveModifier[] | undefined,
  baseValue: number,
  ctx:       Omit<CurveModifierContext, 'baseValue' | 'currentValue'>,
): number {
  if (!modifiers || modifiers.length === 0) return baseValue
  let current = baseValue
  for (const m of modifiers) {
    if (!m.enabled) continue
    const localCtx: CurveModifierContext = {
      ...ctx,
      baseValue,
      currentValue: current,
    }
    const modVal = evaluateModifier(localCtx, m)
    current = blendModifierValue(current, modVal, m.blendMode, m.weight ?? 1)
  }
  return current
}

/** Deterministic hash → integer seed for noise / jitter modifiers. Used so
 *  re-rendering the same scene always produces the same value (cross-
 *  platform reproducibility — see BL-47).
 *
 *  Implementation: cheap FNV-1a 32-bit over UTF-16 code points. Not crypto;
 *  perfectly fine for "stable noise across machines". */
export function hashTrackSeed(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h
}
