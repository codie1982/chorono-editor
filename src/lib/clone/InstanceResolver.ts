// ── InstanceResolver (BL-59 Phase 3) ──────────────────────────────────────────
//
// Resolves a "live instance" layer into a render-ready Layer by pulling
// visual fields from its source while keeping the instance's own transform,
// opacity, parentId and id.
//
// Behaviour matrix:
//
//   layer.instanceOf === undefined  → returns the layer unchanged
//   source found                    → returns composed effective layer
//   source NOT found                → returns null (caller should skip)
//   source is itself an instance    → resolves transitively (five-link limit
//                                     bounds cycles/deep imported chains)
//
// Fields that come from SOURCE at render time:
//   type, shape, shapeKind, shapeParams, path, spline, style, size,
//   text, image, video, audio, pathStroke, motionPath, followPath,
//   masks, internalGrid
//
// Fields that stay on the INSTANCE:
//   id, name, transform, opacity, blendMode, parentId, effects,
//   effectsChain, startMs, endMs, hidden, locked, solo, pinned,
//   frozen, colorLabel, tappable, draggable, dragConfig, paramBindings

import type { Layer } from '../types'
import type { LayerLookup } from '@/lib/scene/LayerIndex'

/** Visual fields cherry-picked from the source. */
const SOURCE_VISUAL_KEYS: Array<keyof Layer> = [
  'type',
  'shape',
  'shapeKind',
  'shapeParams',
  'path',
  'spline',
  'particleEmitter',
  'style',
  'size',
  'text',
  'image',
  'video',
  'audio',
  'pathStroke',
  'motionPath',
  'followPath',
  'masks',
  'internalGrid',
  'repeater',
]

/**
 * Resolve a layer reference. Returns:
 *   - the layer itself when not an instance
 *   - a composed effective layer when it IS an instance and the source exists
 *   - null when its source is missing or the existing five-link limit is exceeded
 * Optional lookup must describe allLayers' exact source snapshot; recursive
 * sources reuse it. Legacy callers keep Array.find behavior without an index.
 */
export function resolveInstanceLayer(
  layer: Layer,
  allLayers: Layer[],
  hops: number = 0,
  lookup?: LayerLookup,
): Layer | null {
  if (!layer.instanceOf) return layer
  if (hops > 4) {
    // Defensive: cycle / very deep chain — bail.
    return null
  }

  const source = lookup ? lookup.get(layer.instanceOf) : allLayers.find((l) => l.id === layer.instanceOf)
  if (!source) return null

  // Resolve the source if IT is also an instance (transitive instances).
  const resolvedSource = source.instanceOf
    ? resolveInstanceLayer(source, allLayers, hops + 1, lookup)
    : source
  if (!resolvedSource) return null

  // Compose: start with source visual fields, then overlay instance
  // identity + transform + render-time editor state.
  const composed: Layer = {
    ...layer, // base = instance (transform / opacity / id / name / parentId / effects / etc.)
  }
  for (const key of SOURCE_VISUAL_KEYS) {
    const value = resolvedSource[key]
    if (value !== undefined) {
      // The cast is safe: SOURCE_VISUAL_KEYS lists Layer-typed keys.
      ;(composed as unknown as Record<string, unknown>)[key as string] = value
    }
  }
  // `type` is required — make sure we picked it up. (Defensive — would
  // only trip if the source somehow lacks `type`, which the type system
  // forbids.)
  if (!composed.type) composed.type = resolvedSource.type

  return composed
}

/**
 * Quick boolean check for "is this layer a live instance reference?"
 * Avoids importing the whole resolver just to ask the question.
 */
export function isInstanceLayer(layer: Layer): boolean {
  return typeof layer.instanceOf === 'string' && layer.instanceOf.length > 0
}
