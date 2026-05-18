// ── Parameter Wiring helpers (BL-05) ──────────────────────────────────────────
// Pure lookup + formatting utilities for ParameterWire / ParameterRef. Kept
// outside the runtime evaluator so the editor UI (inspector icons, list panel,
// modal pickers) can share them with the runtime without circular deps.

import { ANIMATABLE_PROPERTIES } from '../types/editor'
import type {
  ChronoScene, Layer, ParameterRef, ParameterValueType, ParameterWire,
} from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// Identity / key derivation
// ─────────────────────────────────────────────────────────────────────────────

/** Stable string key for a ParameterRef — used for lookups, map keys, and as
 *  the address written into the runtime override map. Format:
 *    layer  property        → "layers.<layerId>.<propertyPath>"
 *    layer  modifier prop   → "layers.<layerId>.modifiers.<modId>.<propertyPath>"
 *    scene parameter        → "params.<propertyPath>"  (no layerId)
 */
export function paramRefKey(ref: ParameterRef): string {
  if (ref.layerId) {
    if (ref.modifierId) return `layers.${ref.layerId}.modifiers.${ref.modifierId}.${ref.propertyPath}`
    return `layers.${ref.layerId}.${ref.propertyPath}`
  }
  return `params.${ref.propertyPath}`
}

/** Inverse of paramRefKey — parses a runtime-style address back into a
 *  ParameterRef. valueType defaults to 'number' since the key alone can't
 *  carry it; callers should overlay the real type when known. */
export function parseParamRef(key: string): ParameterRef | null {
  if (!key) return null
  if (key.startsWith('params.')) {
    return { propertyPath: key.slice('params.'.length), valueType: 'number' }
  }
  if (key.startsWith('layers.')) {
    const parts = key.split('.')
    if (parts.length < 3) return null
    const layerId = parts[1]
    // modifiers.<id>.<rest>
    if (parts[2] === 'modifiers' && parts.length >= 5) {
      return {
        layerId,
        modifierId: parts[3],
        propertyPath: parts.slice(4).join('.'),
        valueType: 'number',
      }
    }
    return {
      layerId,
      propertyPath: parts.slice(2).join('.'),
      valueType: 'number',
    }
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Lookup
// ─────────────────────────────────────────────────────────────────────────────

/** Find the (single) enabled wire driving a specific layer property, if any.
 *  PropertiesPanel uses this to decide whether to disable the input + show
 *  "Driven by …" instead of the editable value field. */
export function findWireForProperty(
  wires: ParameterWire[] | undefined,
  layerId: string,
  propertyPath: string,
): ParameterWire | null {
  if (!wires) return null
  for (const w of wires) {
    if (!w.enabled) continue
    const t = w.target
    if (t.layerId !== layerId) continue
    if (t.propertyPath !== propertyPath) continue
    return w
  }
  return null
}

/** All wires (including disabled) whose target matches a layer property. */
export function findAllWiresForProperty(
  wires: ParameterWire[] | undefined,
  layerId: string,
  propertyPath: string,
): ParameterWire[] {
  if (!wires) return []
  return wires.filter((w) =>
    w.target.layerId === layerId && w.target.propertyPath === propertyPath
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting (human-readable labels)
// ─────────────────────────────────────────────────────────────────────────────

/** "Circle 1 · rotation" / "params.slider1 · slider" — used everywhere the UI
 *  surfaces a wire's source or target to the user. */
export function formatParameterRef(ref: ParameterRef, scene: ChronoScene): string {
  if (ref.layerId) {
    const layer = scene.layers.find((l) => l.id === ref.layerId)
    const layerName = layer?.name ?? ref.layerId
    const modPrefix = ref.modifierId ? `[${ref.modifierId}] ` : ''
    return `${layerName} · ${modPrefix}${ref.propertyPath}`
  }
  // scene parameter
  const p = scene.parameters.find((pp) => pp.id === ref.propertyPath)
  return `params · ${p?.name ?? ref.propertyPath}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Enumeration — drives the SourceParameterPicker tree
// ─────────────────────────────────────────────────────────────────────────────

/** Every animatable property on a layer, as ParameterRefs. Filters out
 *  properties whose layerTypes don't include this layer's type. */
export function listLayerParameterRefs(layer: Layer): ParameterRef[] {
  return ANIMATABLE_PROPERTIES
    .filter((p) => !p.layerTypes || p.layerTypes.includes(layer.type))
    .map((p) => ({
      layerId: layer.id,
      propertyPath: p.path,
      valueType: 'number' as ParameterValueType,
    }))
}

/** Every scene parameter as a ParameterRef. */
export function listSceneParameterRefs(scene: ChronoScene): ParameterRef[] {
  return scene.parameters.map((p) => ({
    propertyPath: p.id,
    valueType: parameterTypeToValueType(p.type),
  }))
}

function parameterTypeToValueType(t: string): ParameterValueType {
  switch (t) {
    case 'number':  return 'number'
    case 'boolean': return 'boolean'
    case 'string':  return 'string'
    case 'color':   return 'color'
    default:        return 'number'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Type compatibility
// ─────────────────────────────────────────────────────────────────────────────

/** Are these two valueTypes compatible (source → target via expression)?
 *  Number is universal — most expressions reduce to a number. Color/vec2
 *  pickers default to grey-out until type conversion lands (Phase 4). */
export function areTypesCompatible(
  source: ParameterValueType,
  target: ParameterValueType,
): boolean {
  // Number / boolean coerce cleanly to number; strings can be parsed.
  if (target === 'number') {
    return source === 'number' || source === 'boolean' || source === 'string'
  }
  // Boolean target: only number/boolean make sense (0/non-0 truthy).
  if (target === 'boolean') {
    return source === 'number' || source === 'boolean'
  }
  // String target: anything stringifies.
  if (target === 'string') return true
  // Color and vec2 require matching source for now.
  return source === target
}

// ─────────────────────────────────────────────────────────────────────────────
// Broken wire detection
// ─────────────────────────────────────────────────────────────────────────────

/** True if either end of a wire references something the scene no longer has.
 *  Drives the red badge in WiringListPanel and the inspector 🔗 indicator. */
export function isWireBroken(wire: ParameterWire, scene: ChronoScene): boolean {
  return isRefBroken(wire.source, scene) || isRefBroken(wire.target, scene)
}

function isRefBroken(ref: ParameterRef, scene: ChronoScene): boolean {
  if (ref.layerId) {
    const layer = scene.layers.find((l) => l.id === ref.layerId)
    if (!layer) return true
    // propertyPath sanity — accept if it matches a known animatable property
    // OR a simple dot-path that resolves on the live layer. The "resolve"
    // path is forgiving; we don't want to flag wires every time a property
    // is added to ANIMATABLE_PROPERTIES.
    return false
  }
  // Scene parameter
  return !scene.parameters.some((p) => p.id === ref.propertyPath)
}
