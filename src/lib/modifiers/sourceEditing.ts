import type { GeometryModifierStackData } from './geometryTypes'
import type { GeometryModifierRegistry } from './builtins'
import type { SplinePathData } from '../types/spline'

/** Find one explicitly source-editable terminal stage. Disabled unrelated rows
 * do not interfere; other enabled topology operations retain readonly policy.
 * Disabled owners still keep the same editable source/IDs. No evaluation or
 * global registry dependency, so bootstrap and numerical modules stay acyclic. */
export function sourceEditingIndex(stack: GeometryModifierStackData, registry: GeometryModifierRegistry): number | undefined {
  const owners = stack.modifiers.flatMap((item, i) => registry.get(item.type).descriptor.sourceEditing === 'inputSpline' ? [i] : [])
  if (owners.length !== 1) return undefined
  const index = owners[0]
  if (stack.modifiers.some((item, i) => item.enabled && i !== index && (i > index || !registry.get(item.type).descriptor.preservesSourceEditing))) return undefined
  if (stack.source.kind !== 'spline' && !stack.modifiers.slice(0, index).some(item => item.enabled && registry.get(item.type).descriptor.output === 'spline')) return undefined
  return index
}

/** Reconcile edits into the actual owner of the admitted source input. An
 * authored Convert Spline override is the last conversion prefix, even when
 * the base itself was already a spline. No generated band points are saved. */
export function withEditedInputSpline(stack: GeometryModifierStackData, data: SplinePathData, registry: GeometryModifierRegistry): GeometryModifierStackData {
  const owner = sourceEditingIndex(stack, registry)
  if (owner === undefined) throw new Error('Choose an editable source before this modifier.')
  let conversion = -1
  stack.modifiers.slice(0, owner).forEach((item, i) => { if (item.enabled && item.type === 'convertSpline') conversion = i })
  if (conversion >= 0) return { ...stack, modifiers: stack.modifiers.map((item, i) => i === conversion ? { ...item, settings: { ...item.settings, edited: data } } : item) }
  if (stack.source.kind !== 'spline') throw new Error('No editable Spline source is available.')
  return { ...stack, source: { kind: 'spline', spline: data } }
}
