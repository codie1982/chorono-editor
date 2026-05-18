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

  if (mode === 'reference' || mode === 'virtual') {
    // Phase 2.5 / Phase 3 modes — fail loudly until implemented.
    throw new Error(
      `CloneMode "${mode}" not implemented yet. Use 'copy' or 'instance'.`,
    )
  }

  // 'copy' and 'instance' both produce a fresh layer via JSON deep-clone +
  // new id. The DIFFERENCE is metadata: 'instance' records sourceId so the
  // renderer (Phase 3) can override geometry to mirror source mutations.
  // For MVP+1 we ship 'instance' as a tagged copy — visually identical to
  // 'copy' but discoverable via layerMetaById for future hot-swap rendering.
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
    mode,
    createdAt: Date.now(),
    arrayGroupId: options.arrayGroupId,
  }

  return {
    clonedLayer,
    idMap: { [source.id]: clonedLayer.id },
    metadata,
  }
}
