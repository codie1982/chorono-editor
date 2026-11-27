import { ModifierStack, type ModifierExecutionPolicy } from './ModifierStack'
import type { GeometryModifierStackData } from './geometryTypes'
import type { GeometryModifierRegistry } from './builtins'
import type { ModifierContext, ModifierGeometry, GeometryModifierDescriptor } from './geometryTypes'
import { assertSplineTopology } from '../spline/topology'
import { Mesh2DTopologyValidator } from '../geometry/mesh2d/Mesh2DTopologyValidator'
import { assertConversionRecipe } from '../geometry/conversion/GeometryConversionService'

/** Geometry admission adapter. New Mesh operations (Smooth/Subdivide, etc.)
 * register normally; this layer validates kinds, topology and resource budgets.
 * The general runner owns order/disabled/error behavior and mutates no object. */
export class GeometryStackEvaluator {
  private readonly policy: ModifierExecutionPolicy<ModifierGeometry, GeometryModifierDescriptor> = {
    validateValue: assertModifierGeometry,
    validateInput: (descriptor, input) => {
      if (!descriptor.inputs.includes(input.kind)) throw new Error(`${descriptor.label} requires ${descriptor.inputs.join(' / ')}, received ${input.kind}.`)
    },
    validateOutput: (descriptor, output) => {
      if (descriptor.output !== output.kind) throw new Error(`${descriptor.label} violated its output geometry contract.`)
    },
  }
  constructor(private readonly registry: GeometryModifierRegistry) {}
  /** Execute source → ordered modifiers → final geometry; no Layer is mutated. */
  execute(data: GeometryModifierStackData, context: ModifierContext, stopBefore?: number): ModifierGeometry {
    return new ModifierStack(data, this.registry, this.policy).execute(context, stopBefore)
  }
  /** Validate portable structure/source/settings without executing algorithms. */
  validate(data: GeometryModifierStackData): void { new ModifierStack(data, this.registry, this.policy) }
}

/** Validate geometry envelopes and domain budgets without coercing formats. */
export function assertModifierGeometry(geometry: ModifierGeometry): void {
  if (!geometry || !['shape', 'spline', 'mesh2d'].includes(geometry.kind)) throw new Error('Unknown modifier geometry kind.')
  if (geometry.kind === 'shape') {
    assertConversionRecipe({ version: 1, sources: geometry.sources, stages: [], unionTolerancePx: geometry.unionTolerancePx })
  } else if (geometry.kind === 'spline') {
    if (!geometry.spline || !geometry.spline.points || Object.keys(geometry.spline.points).length > 8192) throw new Error('Modifier Spline vertex budget exceeded.')
    assertSplineTopology(geometry.spline)
  } else {
    const data = geometry.mesh?.geometry
    if (!data || !Array.isArray(data.positions) || !Array.isArray(data.uvs) || !data.topology || !Array.isArray(data.topology.vertexIds) || !Array.isArray(data.topology.triangleIndices)) throw new Error('Invalid modifier Mesh geometry payload.')
    if (data.positions.length > 524288) throw new Error('Modifier Mesh vertex budget exceeded.')
    const result = new Mesh2DTopologyValidator().validate(geometry.mesh.geometry)
    if (!result.valid) throw new Error(`Invalid modifier Mesh: ${result.diagnostics.map(item => item.code).join(', ')}`)
  }
}
