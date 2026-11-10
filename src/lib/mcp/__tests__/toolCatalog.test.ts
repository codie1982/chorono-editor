import { describe, expect, it } from 'vitest'
import { actionRegistry } from '../../ai/ActionRegistry'
import { getCallableTool, getCapabilities, getToolCatalog, validateToolCall } from '../catalog'
import { implementationToolName, parseToolCatalogProfile, TOOL_ALIASES } from '../tools/ToolCatalogPolicy'

describe('versioned MCP discovery and callable compatibility', () => {
  it('publishes focused workflows while retaining the historical discovery profile', async () => {
    const standard = await getToolCatalog(), legacy = await getToolCatalog('legacy')
    expect(standard).toHaveLength(40)
    expect(legacy).toHaveLength(77)
    expect(new Set(standard.map(tool => tool.name)).size).toBe(standard.length)
    expect(standard.map(tool => tool.name)).toEqual(expect.arrayContaining([
      'get_scene', 'get_layer', 'create_layer', 'upsert_keyframes', 'render_preview',
      'evaluate_frame', 'batch_actions', 'import_asset', 'export_audio', 'undo',
    ]))
    expect(standard.some(tool => tool.name === 'get_scene_json')).toBe(false)
    expect(legacy.map(tool => tool.name)).toEqual(expect.arrayContaining([
      'add_layer', 'create_object', 'get_scene_json', 'evaluate_at_time',
      'add_keyframes', 'set_keyframes', 'patch_object', 'add_sm_state',
    ]))
    for (const tool of legacy) expect((await getCallableTool(tool.name)).name).toBe(tool.name)
  })

  it('aliases preserve exact argument schemas and implementation behavior boundaries', async () => {
    for (const [name, old] of Object.entries(TOOL_ALIASES)) {
      expect((await getCallableTool(name)).inputSchema).toEqual((await getCallableTool(old)).inputSchema)
      expect(implementationToolName(name)).toBe(old)
    }
    await expect(validateToolCall('create_layer', { kind: 'rect', patch: { name: 'Clock face' } })).resolves.toMatchObject({ name: 'create_layer' })
    await expect(validateToolCall('create_object', { kind: 'rect', patch: { name: 'Clock face' } })).resolves.toMatchObject({ name: 'create_object' })
    await expect(validateToolCall('create_layer', { kind: 'rect', unknown: true })).rejects.toThrow('Invalid arguments')
    await expect(validateToolCall('constructor', {})).rejects.toThrow('Unknown tool')
    expect(implementationToolName('constructor')).toBe('constructor')
  })

  it('separates lightweight and exact-schema discovery from the old full response', async () => {
    const full = await getCapabilities() as any
    expect(full.tools).toHaveLength(77)
    expect(full.scripting).toContain('scene.add')
    expect(full.catalog).toMatchObject({ version: 1, profile: 'standard' })
    expect(full.catalog.advertisedToolNames).toHaveLength(40)
    const summary = await getCapabilities('standard', { summary: true }) as any
    expect(summary.tools).toBeUndefined()
    expect(summary.scripting).toBeUndefined()
    expect(summary.objectKinds.every((kind: any) => kind.properties === undefined)).toBe(true)
    const detail = await getCapabilities('standard', { toolName: 'replace_layer_fields' }) as any
    expect(detail).toMatchObject({ implementationName: 'patch_object', canonicalName: 'replace_layer_fields', advertised: false, callableInBatch: true })
    expect(detail.tool.description.toLowerCase()).toContain('replac')
    expect(await getCapabilities('standard', { toolName: 'evaluate_timeline_values' })).toMatchObject({ callableInBatch: false })
    expect(await getCapabilities('standard', { toolName: 'run_script' })).toMatchObject({ callableInBatch: false })
    expect(await getCapabilities('standard', { toolName: 'export_audio' })).toMatchObject({ callableInBatch: false })
    await expect(getCapabilities('standard', { toolName: 'invented' })).rejects.toThrow('Unknown tool')
    await expect(getCapabilities('standard', { summary: true, toolName: 'get_scene' })).rejects.toThrow('either')
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
