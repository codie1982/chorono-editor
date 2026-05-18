// ── CloneSingleLayer (BL-59) ──────────────────────────────────────────────────
//
// Core single-layer clone primitive. Used by:
//   - The Clone Tool (Cmd+D, "Clone with settings…")
//   - CloneTreeResolver (which calls this per node)
//   - ArrayLayerFactory (which calls this per array instance)
//
// Wraps the legacy `cloneLayerForDuplicate()` from defaults.ts but adds:
//   - CloneOptions (mode, offset, name override, arrayGroupId)
//   - Returns idMap + metadata so callers can wire references safely
//   - Throws NotImplementedError for unsupported modes (future-proofing)

import type { Layer } from '../types'
import { cloneLayerForDuplicate } from '../defaults'
import type {
  CloneOptions,
  CloneResult,
  CloneMetadata,
} from './CloneTypes'

/**
 * Clone a single layer (does NOT recurse into children — use
 * cloneLayerTree() for groups).
 *
 * @example
 *   const { clonedLayer, idMap } = cloneSingleLayer(rect, {
 *     mode: 'copy',
 *     offsetX: 20,
 *     offsetY: 20,
 *   })
 *   dispatch(makeAddLayerCmd(clonedLayer))
 *   editor.attachLayerMeta(clonedLayer.id, idMap)
 */
export function cloneSingleLayer<L extends Layer>(
  source: L,
  options: CloneOptions = {},
): CloneResult {
  const mode = options.mode ?? 'copy'

  if (mode !== 'copy') {
    // Phase 2 modes — fail loudly until implemented.
    throw new Error(
      `CloneMode "${mode}" not implemented in MVP. Only 'copy' is supported.`,
    )
  }

  // Deep clone via the existing legacy helper. It generates a fresh id
  // and "Copy" suffix on the name; we override the name below if needed.
  const clonedLayer = cloneLayerForDuplicate(source) as L

  // Apply offset in the source's local-translation space (simple x/y add).
  // World/local/parent space handling lives in ArrayTransformResolver —
  // CloneSingleLayer stays cheap and predictable.
  const offsetX = options.offsetX ?? 0
  const offsetY = options.offsetY ?? 0
  if (offsetX !== 0 || offsetY !== 0) {
    clonedLayer.transform = {
      ...clonedLayer.transform,
      x: clonedLayer.transform.x + offsetX,
      y: clonedLayer.transform.y + offsetY,
    }
  }

  // Name override (takes precedence over the default "X Copy" suffix).
  if (options.nameOverride) {
    clonedLayer.name = options.nameOverride
  }

  // Build metadata — kept OUT of the Layer object (see CloneTypes.ts).
  const metadata: CloneMetadata = {
    sourceId: source.id,
    mode: 'copy',
    createdAt: Date.now(),
    arrayGroupId: options.arrayGroupId,
  }

  return {
    clonedLayer,
    idMap: { [source.id]: clonedLayer.id },
    metadata,
  }
}
