import { ModifierRegistry } from './ModifierRegistry'
import type { ModifierContext, ModifierGeometry, GeometryModifierDescriptor } from './geometryTypes'

export type GeometryModifierRegistry = ModifierRegistry<ModifierGeometry, ModifierContext, GeometryModifierDescriptor>
import { ConvertSplineModifier } from './conversion/ConvertSplineModifier'
import { ConvertMeshModifier } from './conversion/ConvertMeshModifier'
import { OffsetModifier } from './spline/OffsetModifier'
import { OutlineModifier } from './spline/OutlineModifier'
import { ChamferModifier } from './spline/ChamferModifier'
import { FilletModifier } from './spline/FilletModifier'
import { MeshDeformationModifier } from './mesh/MeshDeformationModifier'

/** Composition root for the built-in strategies. Algorithms are not selected
 * by evaluator/UI switch statements; class registrations own defaults/schema. */
export function createGeometryModifierRegistry(): GeometryModifierRegistry {
  const registry = new ModifierRegistry<ModifierGeometry, ModifierContext, GeometryModifierDescriptor>()
  for (const implementation of [ConvertSplineModifier, ConvertMeshModifier, OffsetModifier, OutlineModifier,
    ChamferModifier, FilletModifier, MeshDeformationModifier]) {
    registry.register({ descriptor: implementation.descriptor, create: record => new implementation(record), defaults: implementation.defaults })
  }
  return registry
}
export const geometryModifierRegistry = createGeometryModifierRegistry()
