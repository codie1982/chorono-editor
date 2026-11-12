import { describe, expect, it } from 'vitest'
import { isSourceMutation } from '../source/ToolSourcePolicy'
import { actionRegistry } from '../../ai/ActionRegistry'
import { getToolCatalog, validateToolCall } from '../catalog'
import { withBridgeParameters, withNativeToolContract } from '../toolContext'
import type { ToolDefinition } from '../protocol'

/** Remove presentation-only schema descriptions to compare native validation
 * after the catalog enriches documentation; all validation keywords remain. */
function validationKeywords(schema: unknown): unknown {
  return JSON.parse(JSON.stringify(schema, (key, value) => key === 'description' ? undefined : value))
}

describe('MCP tool contracts', () => {
  it('documents every advertised parameter, including bridge context and nested keyframes', async () => {
    const tools = await getToolCatalog('legacy')
    const missing: string[] = []
    for (const tool of tools) {
      for (const [name, schema] of Object.entries(tool.inputSchema.properties)) {
        if (!(schema as { description?: string }).description?.trim()) missing.push(`${tool.name}.${name}`)
      }
    }
    expect(missing).toEqual([])
    const keys = tools.find(tool => tool.name === 'set_keyframes')!.inputSchema.properties.keyframes.items.properties
    for (const schema of Object.values(keys)) expect((schema as { description: string }).description).toBeTruthy()
  })

  it('preserves native validation while enriching metadata and requiring source authorization', async () => {
    const tools = await getToolCatalog('legacy')
    for (const raw of actionRegistry.toMCPTools()) {
      if (['run_script'].includes(raw.name)) continue // bridge-only replacement
      const tool = tools.find(item => item.name === raw.name)!
      const { sessionId, expectedRevision, readToken, requestId, ...nativeProperties } = tool.inputSchema.properties
      expect(validationKeywords(nativeProperties)).toEqual(validationKeywords(raw.inputSchema.properties))
      expect(tool.inputSchema.required).toEqual([...(raw.inputSchema.required ?? []), ...(isSourceMutation(raw.name) ? ['expectedRevision', 'readToken'] : [])])
      expect(readToken).toMatchObject({ type: 'string', pattern: '^[a-f0-9]{64}$' })
      expect(tool.inputSchema.additionalProperties).toBe(false)
      expect(sessionId.type).toBe('string')
      expect(expectedRevision).toMatchObject({ type: 'integer', minimum: 0 })
      expect(requestId).toMatchObject({ type: 'string', maxLength: 128 })
    }
  })

  it('does not mutate an action reused by the editor AI adapter', () => {
    const source: ToolDefinition = {
      name: 'example', description: 'Example action.',
      inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    }
    const original = structuredClone(source)
    const result = withBridgeParameters(withNativeToolContract(source, false))
    expect(source).toEqual(original)
    expect(result).not.toBe(source)
    expect(result.inputSchema.properties).not.toBe(source.inputSchema.properties)
  })

  it('distinguishes enforced revision guards from discovery, read and export arguments', async () => {
    const tools = await getToolCatalog('legacy')
    const description = (name: string, param: string): string => tools.find(tool => tool.name === name)!.inputSchema.properties[param].description
    expect(description('list_projects', 'sessionId')).toMatch(/unused/i)
    expect(description('get_scene', 'expectedRevision')).toMatch(/not checked/i)
    expect(description('export_svg', 'expectedRevision')).toMatch(/not checked/i)
    expect(description('render_audio_preview', 'expectedRevision')).toMatch(/rejects a stale/i)
    expect(description('export_audio', 'expectedRevision')).toMatch(/rejects a stale/i)
    expect(description('save_project', 'expectedRevision')).toMatch(/rejects a stale/i)
    expect(description('redo', 'expectedRevision')).toMatch(/rejects a stale/i)
    expect(description('redo', 'readToken')).toMatch(/one-use/)
    expect(description('redo', 'requestId')).toMatch(/last 64/)
  })

  it('preserves model-valued keys and extensible nested configurations without widening outer inputs', async () => {
    const access = { expectedRevision: 0, readToken: 'a'.repeat(64) }
    await expect(validateToolCall('set_keyframes', { ...access,
      timelineId: 'intro', layerId: 'hero', property: 'style.fill.color',
      keyframes: [{ timeMs: 0, value: '#ffffff', easing: { type: 'customBezier', bezier: { cx1: 0.2, cy1: 0, cx2: 0.3, cy2: 1 } } }],
    })).resolves.toHaveProperty('name', 'set_keyframes')
    await expect(validateToolCall('add_modifier', { ...access,
      timelineId: 'intro', target: 'layers.hero.transform.x', modifier: { type: 'sine', parameters: { amplitude: 20, frequency: 1 }, weight: 0.5 },
    })).resolves.toHaveProperty('name', 'add_modifier')
    await expect(validateToolCall('configure_particles', { ...access,
      layerId: 'emitter', config: { emitter: { maxParticles: 100 }, particle: { opacity: { value: 0.5 } } },
    })).resolves.toHaveProperty('name', 'configure_particles')
    await expect(validateToolCall('redo', { ...access, newUnknownField: true })).rejects.toThrow('Invalid arguments')
  })
})
