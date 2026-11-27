import { describe, expect, it } from 'vitest'
import { actionRegistry } from '../../ai/ActionRegistry'
import { getCallableTool, getCapabilities, getToolCatalog, validateToolCall } from '../catalog'
import { implementationToolName, parseToolCatalogProfile, TOOL_ALIASES } from '../tools/ToolCatalogPolicy'
import { newModelLayer } from '../../model3d/source/modelDefaults'
import { emptyScene } from '../../defaults'

describe('versioned MCP discovery and callable compatibility', () => {
  it('publishes focused workflows while retaining the historical discovery profile', async () => {
    const standard = await getToolCatalog(), legacy = await getToolCatalog('legacy')
    expect(standard).toHaveLength(79)
    expect(legacy).toHaveLength(116)
    expect(new Set(standard.map(tool => tool.name)).size).toBe(standard.length)
    expect(standard.map(tool => tool.name)).toEqual(expect.arrayContaining([
      'get_handoff_context', 'get_scene', 'get_layer', 'create_layer', 'upsert_keyframes', 'render_preview',
      'evaluate_frame', 'batch_actions', 'import_asset', 'render_2d', 'bake_rigid_bodies',
      'bake_voronoi_fracture', 'prepare_rigid_body_bake', 'prepare_voronoi_fracture_bake',
      'get_bake_job', 'preview_bake_job', 'cancel_bake_job', 'discard_bake_job',
      'commit_bake_job', 'inspect_physics_bake', 'clear_physics_bake', 'update_model3d', 'export_audio', 'undo',
    ]))
    expect(standard.some(tool => tool.name === 'get_scene_json')).toBe(false)
    expect(legacy.map(tool => tool.name)).toEqual(expect.arrayContaining([
      'add_layer', 'create_object', 'get_scene_json', 'evaluate_at_time',
      'add_keyframes', 'set_keyframes', 'patch_object', 'add_sm_state',
    ]))
    for (const tool of legacy) expect((await getCallableTool(tool.name)).name).toBe(tool.name)
  })

  it('aliases preserve exact argument schemas and implementation behavior boundaries', async () => {
    const access = { expectedRevision: 0, readToken: 'a'.repeat(64) }
    for (const [name, old] of Object.entries(TOOL_ALIASES)) {
      expect((await getCallableTool(name)).inputSchema).toEqual((await getCallableTool(old)).inputSchema)
      expect(implementationToolName(name)).toBe(old)
    }
    await expect(validateToolCall('create_layer', { kind: 'rect', patch: { name: 'Clock face' }, ...access })).resolves.toMatchObject({ name: 'create_layer' })
    await expect(validateToolCall('create_object', { kind: 'rect', patch: { name: 'Clock face' }, ...access })).resolves.toMatchObject({ name: 'create_object' })
    await expect(validateToolCall('create_layer', { kind: 'rect', unknown: true, ...access })).rejects.toThrow('Invalid arguments')
    await expect(validateToolCall('constructor', {})).rejects.toThrow('Unknown tool')
    expect(implementationToolName('constructor')).toBe('constructor')
  })

  it('separates lightweight and exact-schema discovery from the old full response', async () => {
    const full = await getCapabilities() as any
    expect(full.tools).toHaveLength(116)
    expect(full.scripting).toContain('scene.add')
    expect(full.catalog).toMatchObject({ version: 1, profile: 'standard' })
    expect(full.catalog.advertisedToolNames).toHaveLength(79)
    const summary = await getCapabilities('standard', { summary: true }) as any
    expect(summary.tools).toBeUndefined()
    expect(summary.scripting).toBeUndefined()
    expect(summary.objectKinds.every((kind: any) => kind.properties === undefined)).toBe(true)
    expect(summary.objectKinds).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'mesh2d', category: 'Mesh & Surface' }),
    ]))
    const detail = await getCapabilities('standard', { toolName: 'replace_layer_fields' }) as any
    expect(detail).toMatchObject({ implementationName: 'patch_object', canonicalName: 'replace_layer_fields', advertised: false, callableInBatch: true })
    expect(detail.tool.description.toLowerCase()).toContain('replac')
    expect(await getCapabilities('standard', { toolName: 'evaluate_timeline_values' })).toMatchObject({ callableInBatch: false })
    expect(await getCapabilities('standard', { toolName: 'run_script' })).toMatchObject({ callableInBatch: false })
    expect(await getCapabilities('standard', { toolName: 'export_audio' })).toMatchObject({ callableInBatch: false })
    await expect(getCapabilities('standard', { toolName: 'invented' })).rejects.toThrow('Unknown tool')
    await expect(getCapabilities('standard', { summary: true, toolName: 'get_scene' })).rejects.toThrow('either')
  })

  it('validates source counters independently of geometry/time workload limits', async () => {
    const access = { expectedRevision: 8_000_000, readToken: 'a'.repeat(64) }
    await expect(validateToolCall('create_layer', { kind: 'rect', ...access })).resolves.toMatchObject({ name: 'create_layer' })
    await expect(validateToolCall('update_layer', { layerId: 'rect', x: 8_000_000, ...access })).rejects.toThrow('Numeric input limit exceeded')
    await expect(validateToolCall('create_layer', { kind: 'rect', ...access, expectedRevision: Number.MAX_SAFE_INTEGER + 1 })).rejects.toMatchObject({ code: 'EXPECTED_REVISION_REQUIRED' })
  })

  it('discovers and applies a bounded model edit without losing sibling camera fields or asset identity', async () => {
    const access = { expectedRevision: 2, readToken: 'a'.repeat(64) }
    const importTool = await getCallableTool('import_asset')
    expect(importTool.inputSchema.properties.data.maxLength).toBe(4 * Math.ceil(16 * 1024 ** 2 / 3))
    const info = await getCapabilities('standard', { toolName: 'update_model3d' }) as any
    expect(info).toMatchObject({ advertised: true, callableInBatch: true })
    await expect(validateToolCall('update_model3d', { layerId: 'model', patch: { camera: { yaw: 55 } }, box: { width: 600 }, ...access })).resolves.toBeDefined()
    await expect(validateToolCall('update_model3d', { layerId: 'model', patch: { assetId: 'other' }, ...access })).rejects.toThrow('Invalid arguments')
    await expect(validateToolCall('update_model3d', { layerId: 'model', box: { width: 4097 }, ...access })).rejects.toThrow('Invalid arguments')
    const layer = newModelLayer('model', 'original'), scene = { ...emptyScene(), layers: [layer] }
    const edit = actionRegistry.get('update_model3d')!.toCommand!({ layerId: 'model', patch: { camera: { yaw: 55 } }, box: { width: 600 } }, scene)!
    const changed = edit.execute(scene)
    expect(changed.layers[0].model3d).toMatchObject({ assetId: 'original', camera: { yaw: 55, pitch: 15, distance: 3.5 } })
    expect(changed.layers[0].size).toEqual({ width: 600, height: 400 })
    expect(changed.layers[0].transform).toEqual(layer.transform)
    expect(edit.undo(changed)).toEqual(scene)
    expect(() => actionRegistry.get('update_model3d')!.toCommand!({ layerId: 'model', patch: { camera: { pitch: 90.1 } } }, scene)).toThrow('outside supported ranges')
  })

  it('keeps discovery immutable without freezing the owning native registry', async () => {
    const tool = await getCallableTool('add_layer')
    expect(Object.isFrozen(tool.inputSchema.properties)).toBe(true)
    expect(Object.isFrozen(actionRegistry.get('add_layer')!.parameters.properties)).toBe(false)
    expect(() => { tool.inputSchema.properties.injected = { type: 'string' } }).toThrow()
    expect((await getCallableTool('add_layer')).inputSchema.properties.injected).toBeUndefined()
  })

  it('requires deliberate valid discovery configuration', () => {
    expect(parseToolCatalogProfile()).toBe('standard')
    expect(parseToolCatalogProfile('legacy')).toBe('legacy')
    expect(() => parseToolCatalogProfile('standrad')).toThrow('CHORONO_MCP_TOOL_PROFILE')
  })
})
