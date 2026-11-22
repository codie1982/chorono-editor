import type { Layer } from '../types'
import { modifierOutputReadOnly } from './ModifierStackService'
import { modifierStackService } from './scene'
import { canonicalJson } from '../hash/CanonicalRecordHash'

/** Reconcile ordinary immutable layer edits with canonical stack source.
 * Paint/placement keep their existing ownership. Generated geometry refuses
 * direct writes; an editable source or conversion-only Spline updates the base
 * or its authored control override and recomputes downstream. */
export function reconcileModifierLayerPatch(previous: Layer, patch: Partial<Layer>): Layer {
  const next = { ...previous, ...patch }, stack = previous.modifierStack
  if (!stack) return next
  if (next.type !== previous.type) throw new Error('Use Convert or modifier stack commands to change the geometry representation.')
  if ('modifierStack' in patch && patch.modifierStack !== stack) throw new Error('Use modifier stack commands to change source/settings/order.')
  const differs = (a: unknown, b: unknown) => a !== b && canonicalJson(a ?? null) !== canonicalJson(b ?? null)
  if (differs(previous.mesh2d?.deformation, next.mesh2d?.deformation)) throw new Error('Edit playback in the Deformation Clip modifier.')
  const geometryChanged = previous.shape !== next.shape || previous.shapeKind !== next.shapeKind || differs(previous.spline, next.spline) || differs(previous.mesh2d?.geometry, next.mesh2d?.geometry)
    || differs(previous.shapeParams, next.shapeParams) || differs(previous.size, next.size) || previous.style?.cornerRadius !== next.style?.cornerRadius
  if (!geometryChanged) return next
  if (modifierOutputReadOnly(previous)) throw new Error('Disable geometry modifiers or Bake stack before editing source points.')
  if (next.type === 'spline' && next.spline) {
    if (stack.source.kind === 'spline') return modifierStackService.execute(next, { ...stack, source: { kind: 'spline', spline: next.spline } })
    const index = stack.modifiers.findIndex(item => item.enabled && item.type === 'convertSpline')
    if (index >= 0) return modifierStackService.execute(next, { ...stack, modifiers: stack.modifiers.map((item, i) => i === index ? { ...item, settings: { ...item.settings, edited: next.spline } } : item) })
  }
  if (next.type === 'shape' && stack.source.kind === 'shape' && stack.source.sources.length === 1) return modifierStackService.execute(next, {
    ...stack, source: { ...stack.source, sources: [{ ...stack.source.sources[0], shape: next.shape, shapeKind: next.shapeKind,
      shapeParams: next.shapeParams, size: next.size, cornerRadius: next.style?.cornerRadius }] },
  })
  if (next.type === 'mesh2d' && next.mesh2d && stack.source.kind === 'mesh2d') return modifierStackService.execute(next, {
    ...stack, source: { kind: 'mesh2d', mesh: { ...next.mesh2d, deformation: undefined } },
  })
  throw new Error('Bake the modifier stack before changing its generated geometry.')
}
