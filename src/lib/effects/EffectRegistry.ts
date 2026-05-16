// ── EffectRegistry ────────────────────────────────────────────────────────────
//
// Plugin registry for layer post-processing effects. Each effect plugin takes
// an offscreen canvas (the layer's rendered content) and returns a new
// offscreen canvas with the effect applied.
//
// Pipeline: layer rendered → effect 1 → effect 2 → … → composited to dest.
//
// V1 ships: blur, glow, shadow. Adding a new effect requires only a new
// plugin file + register() call.

export interface EffectDefinition {
  id:      string
  type:    string
  enabled: boolean
  params:  Record<string, unknown>
}

export interface EffectPlugin<T extends EffectDefinition = EffectDefinition> {
  type:  string
  /** Applies the effect to `input`. May return `input` itself (mutated) or a new canvas. */
  apply(input: HTMLCanvasElement, effect: T): HTMLCanvasElement
}

export class EffectRegistry {
  private byType = new Map<string, EffectPlugin>()

  register(plugin: EffectPlugin): void {
    if (this.byType.has(plugin.type)) {
      throw new Error(`EffectRegistry: type "${plugin.type}" already registered`)
    }
    this.byType.set(plugin.type, plugin)
  }

  get(type: string): EffectPlugin | undefined {
    return this.byType.get(type)
  }

  /** Applies an ordered chain of effects to the input canvas. */
  applyChain(input: HTMLCanvasElement, effects: EffectDefinition[]): HTMLCanvasElement {
    let current = input
    for (const eff of effects) {
      if (!eff.enabled) continue
      const plugin = this.byType.get(eff.type)
      if (!plugin) continue
      current = plugin.apply(current, eff)
    }
    return current
  }

  clear(): void { this.byType.clear() }
}

export const effectRegistry = new EffectRegistry()
