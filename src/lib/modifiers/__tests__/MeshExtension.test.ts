import { describe, expect, it } from 'vitest'
import { Modifier } from '../Modifier'
import { ModifierStackService } from '../ModifierStackService'
import { createGeometryModifierRegistry } from '../builtins'
import type { GeometryModifierDescriptor, ModifierContext, ModifierGeometry } from '../geometryTypes'
import { StructuredGridMesh2DGenerator } from '../../geometry/mesh2d/StructuredGridMesh2DGenerator'
import { newStructuredGridMesh2DLayer } from '../../registry/definitions/mesh2d/Mesh2DDefinition'
import { emptyScene } from '../../defaults'
import { AssetIndex } from '../../asset/AssetIndex'
import { prepareAddModifier, makeExecuteModifierStackCmd, makeToggleModifierCmd, makeSetModifierSourceCmd } from '../../editor/modifiers/commands'

/** Test-only registered Mesh strategy with genuinely new connectivity. Reuses
 * the grid generator instead of inventing a fake subdivision implementation.
 * Demonstrates that topology-changing Mesh modifiers need no runner/UI switch. */
class GridDetailFixture extends Modifier<ModifierGeometry, ModifierContext, GeometryModifierDescriptor> {
  static readonly descriptor: GeometryModifierDescriptor = { type: 'test-grid-detail', label: 'Grid detail fixture', category: 'mesh', inputs: ['mesh2d'], output: 'mesh2d', addable: true,
    fields: [{ key: 'level', label: 'Level', kind: 'number', min: 1, max: 3, step: 1 }] }
  readonly descriptor = GridDetailFixture.descriptor
  validate() { if (!Number.isInteger(this.settings.level) || Number(this.settings.level) < 1 || Number(this.settings.level) > 3) throw new Error('Level 1–3 required.') }
  protected evaluate(input: ModifierGeometry): ModifierGeometry {
    if (input.kind !== 'mesh2d' || input.mesh.source.kind !== 'structuredGrid') throw new Error('Structured grid required.')
    const source = input.mesh.source, factor = 2 ** Number(this.settings.level)
    return { kind: 'mesh2d', mesh: new StructuredGridMesh2DGenerator().generate({ ...source, columns: source.columns * factor, rows: source.rows * factor }) }
  }
}

describe('Mesh modifier extension and asset lifetime', () => {
  it('executes a registered Mesh modifier which increases vertex/triangle detail', () => {
    const registry = createGeometryModifierRegistry().register({ descriptor: GridDetailFixture.descriptor, create: record => new GridDetailFixture(record), defaults: () => ({ level: 1 }) })
    const service = new ModifierStackService(registry), layer = newStructuredGridMesh2DLayer(), stack = service.stackFor(layer)
    const data = { ...stack, modifiers: [registry.newRecord('test-grid-detail', 'detail', stack.source)] }
    const result = service.execute(layer, data)
    expect(result.mesh2d!.geometry.topology.vertexIds.length).toBeGreaterThan(layer.mesh2d!.geometry.topology.vertexIds.length)
    expect(result.mesh2d!.geometry.topology.triangleIndices.length).toBe(layer.mesh2d!.geometry.topology.triangleIndices.length * 4)
    expect(result.modifierStack!.source).toEqual(stack.source)
    expect(service.execute(layer, data).mesh2d).toEqual(result.mesh2d)
    expect(registry.list().find(item => item.type === 'test-grid-detail')?.category).toBe('mesh')
  })
  it('keeps a disabled clip referenced and refuses silently rebinding changed rest positions', () => {
    const layer = { ...newStructuredGridMesh2DLayer(), id: 'mesh' }, initial = { ...emptyScene(), layers: [layer], assets: [{ id: 'clip', name: 'Clip', type: 'meshDeformation' as const, url: 'data:application/octet-stream;base64,AA==' }] }
    const added = prepareAddModifier(initial, layer.id, 'meshDeformation'), scene = added.command.execute(initial)
    const bound = makeExecuteModifierStackCmd(scene, layer.id, { [added.modifierId]: { assetId: 'clip' } }).execute(scene)
    expect(bound.layers[0].mesh2d!.deformation?.assetId).toBe('clip')
    const stack = bound.layers[0].modifierStack!, source = stack.source
    if (source.kind !== 'mesh2d') throw new Error('Expected Mesh source.')
    const changed = { ...source, mesh: { ...source.mesh, geometry: { ...source.mesh.geometry, positions: source.mesh.geometry.positions.map(value => value * 2) } } }
    expect(() => makeSetModifierSourceCmd(bound, layer.id, changed)).toThrow(/rest positions changed/)
    const disabled = makeToggleModifierCmd(bound, layer.id, added.modifierId, false).execute(bound)
    expect(disabled.layers[0].mesh2d!.deformation).toBeUndefined()
    const index = new AssetIndex(); index.build(disabled.layers)
    expect(index.getUsage('clip').layerIds).toContain(layer.id)
  })
})
