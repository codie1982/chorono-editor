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

import type { CanvasSurfaceAllocator } from '@/lib/render/resources/CanvasSurfaceScope'
import type { PathBounds } from '@/lib/geometry/computePathBounds'

export interface EffectDefinition {
  id:      string
  type:    string
  enabled: boolean
  params:  Record<string, unknown>
}

export interface EffectPlugin<T extends EffectDefinition = EffectDefinition> {
  type:  string
  /** Pure visual effect maps fully transparent input to transparent output.
   * Opt-in permits zero-alpha paint culling, never spatial/temporal culling. */
  readonly alphaSafe?: boolean
  /** Translation-invariant support + input-neighbourhood margin in composition
   * pixels. Null/absent means canvas-domain dependent or unproven: keep full
   * composition. Ordered chain margins accumulate; never infer from type names. */
  regionPadding?(effect: T): number | null
  /** Optional fused pass: input/output keep full extent, only intermediate
   * scratch uses this certified composition rect. Requires an owned allocator.
   * This avoids crop/expand copies for a single maskless effect. */
  applyRegion?(input: HTMLCanvasElement, effect: T, region: PathBounds, surfaces: CanvasSurfaceAllocator): HTMLCanvasElement
  /**
   * Input is borrowed. Return input unchanged/mutated, or a new caller-owned
   * output. When an allocator is supplied, all new output/scratch must use it;
   * cached/borrowed foreign outputs cannot satisfy bounded render ownership.
   * Two-argument standalone callers retain their ordinary canvas result.
   */
  apply(input: HTMLCanvasElement, effect: T, surfaces?: CanvasSurfaceAllocator): HTMLCanvasElement
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

  /**
   * Applies ordered effects; borrows input, transfers final output to caller.
   * Scoped calls return intermediate outputs as soon as the next pass consumes
   * them. The caller disposes the scope on failure/final composite. A plugin
   * ignoring the supplied allocator fails explicitly rather than escaping its
   * admission budget. Legacy calls without an allocator preserve apply behavior.
   */
  applyChain(input: HTMLCanvasElement, effects: readonly EffectDefinition[], surfaces?: CanvasSurfaceAllocator, region?: PathBounds): HTMLCanvasElement {
    let current = input
    const releaseIntermediate = (canvas: HTMLCanvasElement) => {
      if (canvas === input) return
      if (surfaces) surfaces.release(canvas)
      else canvas.width = canvas.height = 0
    }
    try {
      for (const eff of effects) {
        if (!eff.enabled) continue
        const plugin = this.byType.get(eff.type)
        if (!plugin) continue
        const next = region && surfaces && plugin.applyRegion
          ? plugin.applyRegion(current, eff, region, surfaces) : plugin.apply(current, eff, surfaces)
        if (surfaces && next !== current && !surfaces.owns(next)) {
          // Plugin contract transfers a new output; dispose it on rejection.
          next.width = next.height = 0
          throw new Error(`Effect "${eff.type}" must allocate its output through the supplied surface allocator.`)
        }
        if (next !== current) releaseIntermediate(current)
        current = next
      }
      return current
    } catch (error) { releaseIntermediate(current); throw error }
  }

  clear(): void { this.byType.clear() }
}

export const effectRegistry = new EffectRegistry()
