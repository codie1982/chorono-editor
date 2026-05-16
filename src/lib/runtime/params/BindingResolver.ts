// ── BindingResolver ───────────────────────────────────────────────────────────
//
// Reads parameter values from ParameterStore and emits LayerPatch[] describing
// the property updates to apply for the current frame.
//
// LayerPatches are NOT applied directly to the scene — that would create an
// undo/redo mess. Instead the renderer reads them through the override map
// (same channel as keyframe evaluations), so they are transient per-frame.

import type { ParameterStore, RuntimeValue } from './ParameterStore'

export interface ParameterBinding {
  parameterName: string
  targetLayerId: string
  /** Dot-path into Layer, e.g. 'style.stroke.trim.end'. */
  targetPath:    string
  /** Optional numeric remap: input range → output range. */
  map?: ValueMap
}

export interface ValueMap {
  inputMin:  number
  inputMax:  number
  outputMin: number
  outputMax: number
  /** Clamp output to [outputMin, outputMax]. Default true. */
  clamp?:    boolean
  /** Reverse the mapping. Default false. */
  reverse?:  boolean
}

export interface LayerPatch {
  layerId:  string
  path:     string
  /** Always a number for now — colour params come later when we extend the type. */
  value:    number
}

export class BindingResolver {
  resolve(bindings: ParameterBinding[], store: ParameterStore): LayerPatch[] {
    const out: LayerPatch[] = []
    for (const b of bindings) {
      const raw = store.get(b.parameterName)
      if (raw === undefined) continue
      const num = this.toNumber(raw)
      if (num === undefined) continue
      const mapped = b.map ? this.applyMap(num, b.map) : num
      out.push({ layerId: b.targetLayerId, path: b.targetPath, value: mapped })
    }
    return out
  }

  private toNumber(v: RuntimeValue): number | undefined {
    if (typeof v === 'number')  return v
    if (typeof v === 'boolean') return v ? 1 : 0
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : undefined
  }

  private applyMap(value: number, map: ValueMap): number {
    const span = map.inputMax - map.inputMin
    if (span === 0) return map.outputMin

    let t = (value - map.inputMin) / span
    if (map.reverse) t = 1 - t

    let out = map.outputMin + t * (map.outputMax - map.outputMin)
    if (map.clamp !== false) {
      const lo = Math.min(map.outputMin, map.outputMax)
      const hi = Math.max(map.outputMin, map.outputMax)
      out = Math.max(lo, Math.min(hi, out))
    }
    return out
  }

  /**
   * Converts LayerPatches into an OverrideMap-compatible structure
   * (`layers.<id>.<path>` → number). Mergeable with evaluateTimelines() output.
   */
  static patchesToOverrides(patches: LayerPatch[]): Map<string, number> {
    const m = new Map<string, number>()
    for (const p of patches) m.set(`layers.${p.layerId}.${p.path}`, p.value)
    return m
  }
}

export const defaultBindingResolver = new BindingResolver()
