// ── RuntimeValidator ──────────────────────────────────────────────────────────
//
// Pre-export sanity check. Returns errors (must fix to export) and warnings
// (non-fatal). Catches:
//   - Missing assets (image / video / audio references)
//   - Cyclic group/mask references
//   - Excessive layer counts (host runtime may struggle)
//   - Empty / invalid composition

import type { ChronoScene, Layer } from '../types'
import type { RuntimeValidationResult, RuntimeError, RuntimeWarning } from '../types/runtime'
import { SceneTraversal } from '../scene/SceneTraversal'

export interface ValidatorOptions {
  /** Warn if scene has more than this many layers. Default 500. */
  maxLayers?: number
}

export class RuntimeValidator {
  constructor(private opts: ValidatorOptions = {}) {}

  validate(scene: ChronoScene): RuntimeValidationResult {
    const errors:   RuntimeError[]   = []
    const warnings: RuntimeWarning[] = []

    // ── Composition sanity ──────────────────────────────────────────────────
    if (!scene.composition || scene.composition.width <= 0 || scene.composition.height <= 0) {
      errors.push({
        code: 'INVALID_COMPOSITION',
        message: 'Composition width/height must be positive numbers',
      })
    }
    if (scene.layers.length === 0) {
      warnings.push({ code: 'EXCESSIVE_LAYERS', message: 'Scene has no layers' })
    }

    // ── Asset references ────────────────────────────────────────────────────
    const assetIds = new Set(scene.assets.map(a => a.id))
    for (const layer of scene.layers) {
      const refs: { kind: string; id?: string }[] = [
        { kind: 'image', id: layer.image?.assetId },
        { kind: 'video', id: layer.video?.assetId },
        { kind: 'audio', id: layer.audio?.assetId },
      ]
      for (const r of refs) {
        if (r.id && !assetIds.has(r.id)) {
          errors.push({
            code: 'MISSING_ASSET',
            message: `Layer "${layer.name}" references missing ${r.kind} asset "${r.id}"`,
            layerId: layer.id,
          })
        }
      }
    }

    // ── Cyclic group references ────────────────────────────────────────────
    const cycles = this.findGroupCycles(scene.layers)
    for (const cycle of cycles) {
      errors.push({
        code: 'CYCLIC_REFERENCE',
        message: `Group cycle detected: ${cycle.join(' → ')}`,
      })
    }

    // ── Layer count budget ─────────────────────────────────────────────────
    const limit = this.opts.maxLayers ?? 500
    if (scene.layers.length > limit) {
      warnings.push({
        code: 'EXCESSIVE_LAYERS',
        message: `Scene has ${scene.layers.length} layers (recommended ≤ ${limit})`,
      })
    }

    return { errors, warnings }
  }

  private findGroupCycles(layers: Layer[]): string[][] {
    const cycles: string[][] = []
    for (const l of layers) {
      if (!l.parentId) continue
      // Walk up parent chain; if we revisit l.id → cycle.
      const visited = new Set<string>()
      let cur: string | undefined = l.parentId
      const chain: string[] = [l.id]
      while (cur) {
        chain.push(cur)
        if (visited.has(cur) || cur === l.id) {
          cycles.push(chain)
          break
        }
        visited.add(cur)
        const parent = layers.find(p => p.id === cur)
        cur = parent?.parentId
      }
    }
    return cycles
  }
}

export const defaultRuntimeValidator = new RuntimeValidator()
