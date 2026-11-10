import Ajv from 'ajv'
import { describe, expect, it } from 'vitest'
import type { ToolDefinition } from '../../protocol'
import { bootstrapMCPActions } from '../../actions'
import { actionRegistry } from '../../../ai/ActionRegistry'
import { decorateToolDefinition } from './index'

/** Source-only fixture: no browser, local files or scene mutation is required
 * to verify how metadata changes the caller-visible contract. */
function definition(name: string, inputSchema: ToolDefinition['inputSchema'] = { type: 'object', properties: {} }): ToolDefinition {
  return { name, description: 'Original description.', inputSchema,
    annotations: { readOnlyHint: true, openWorldHint: false } }
}

describe('MCP tool definition presentation', () => {
  it('keeps a renamed handler’s shallow replacement contract explicit and owns its schema copy', () => {
    const input = definition('replace_layer_fields', { type: 'object', required: ['layerId', 'patch'],
      properties: { layerId: { type: 'string' }, patch: { type: 'object', properties: { nested: { type: 'object', additionalProperties: true } } } },
      additionalProperties: false })
    const before = structuredClone(input)
    const result = decorateToolDefinition(input, 'patch_object')
    expect(result.name).toBe('replace_layer_fields')
    expect(result.description).toContain('Nested objects replace their whole previous value')
    expect(result.inputSchema.properties.patch.description).toContain('replace their complete current value')
    result.inputSchema.properties.patch.properties.nested.description = 'Caller mutation'
    expect(input).toEqual(before)
    expect(result.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true, idempotentHint: false })
  })

  it('does not narrow valid legacy payloads or weaken invalid-payload rejection', () => {
    const schema = { type: 'object', required: ['keyframes'], additionalProperties: false,
      properties: { keyframes: { type: 'array', minItems: 1, items: { type: 'object', required: ['timeMs', 'value'],
        properties: { timeMs: { type: 'number', minimum: 0 }, value: { anyOf: [{ type: 'number' }, { type: 'string' },
          { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'], additionalProperties: false }] } }, additionalProperties: false } } } }
    const original = new Ajv({ strict: false }).compile(schema)
    const decorated = new Ajv({ strict: false }).compile(decorateToolDefinition(definition('upsert_keyframes', schema), 'set_keyframes').inputSchema)
    for (const payload of [{ keyframes: [{ timeMs: 0, value: 0 }] }, { keyframes: [{ timeMs: 10.5, value: '#fe3010' }] },
      { keyframes: [{ timeMs: 100, value: { x: 2, y: -3 } }] }, { keyframes: [{ timeMs: -1, value: 2 }] },
      { keyframes: [] }, { keyframes: [{ timeMs: 1, value: { x: 2 } }] }, { keyframes: [{ timeMs: 1, value: 0 }], extra: true }]) {
      expect(decorated(payload)).toBe(original(payload))
    }
  })

  it('documents common and nested batch arguments without inventing unknown-field semantics', () => {
    const input = definition('batch_actions', { type: 'object', properties: {
      sessionId: { type: 'string' }, expectedRevision: { type: 'integer' }, requestId: { type: 'string' },
      actions: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, arguments: { type: 'object' } } } },
      futureUnspecifiedField: { type: 'number' },
    } })
    const result = decorateToolDefinition(input, 'batch_actions').inputSchema.properties
    expect(result.sessionId.description).toContain('multiple tabs')
    expect(result.expectedRevision.description).toContain('not proof of a fresh read')
    expect(result.requestId.description).toContain('Not durable across sessions')
    expect(result.actions.items.description).toContain('ordered native')
    expect(result.actions.items.properties.name.description).toContain('native authoring action')
    expect(result.actions.items.properties.arguments.description).toContain('entire ordered batch')
    expect(result.futureUnspecifiedField).toEqual({ type: 'number' })
  })

  it('distinguishes structured snapshots and runtime-aware values from legacy formatted reads', () => {
    const snapshot = decorateToolDefinition(definition('get_scene'), 'get_scene')
    const legacy = decorateToolDefinition(definition('get_scene_json'), 'get_scene_json')
    const frame = decorateToolDefinition(definition('evaluate_frame'), 'evaluate_frame')
    const timelines = decorateToolDefinition(definition('evaluate_timeline_values'), 'evaluate_at_time')
    expect(snapshot.description).toContain('structured snapshot')
    expect(legacy.description).toContain('textual content field')
    expect(frame.description).toContain('including timelines, bindings and wires')
    expect(timelines.description).toContain('not pixels, parameter wiring or live state-machine output')
    expect([snapshot, legacy, frame, timelines].every(tool => tool.annotations?.readOnlyHint && tool.annotations.idempotentHint)).toBe(true)
  })

  it('labels actual file creation as a write and keeps source undo separate', () => {
    for (const name of ['render_audio_preview', 'export_audio', 'export_svg', 'export_sequence', 'export_runtime']) {
      const result = decorateToolDefinition(definition(name), name)
      expect(result.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: false })
      expect(result.description).toMatch(/write|file|directory/)
    }
    expect(decorateToolDefinition(definition('save_project'), 'save_project').annotations?.destructiveHint).toBe(true)
    const projects = decorateToolDefinition(definition('list_projects'), 'list_projects')
    expect(projects.annotations).toMatchObject({ readOnlyHint: false, idempotentHint: true })
    expect(projects.description).toContain('directory may be initialized')
  })

  it('does not claim idempotent execution for events, history, scripts or future handlers', () => {
    for (const name of ['control_runtime', 'control_playback', 'undo', 'redo', 'run_script', 'batch_actions', 'apply_script_plan', 'future_handler']) {
      expect(decorateToolDefinition(definition(name), name).annotations).toMatchObject({ readOnlyHint: false, idempotentHint: false })
    }
    expect(decorateToolDefinition(definition('control_runtime'), 'control_runtime').annotations?.destructiveHint).toBe(false)
    expect(decorateToolDefinition(definition('run_script'), 'run_script').annotations?.destructiveHint).toBe(true)
  })

  it('discloses possible existing remote asset reads only on handlers that actually load media', () => {
    for (const name of ['render_preview', 'render_audio_preview', 'export_audio', 'export_sequence', 'normalize_audio_clip']) {
      expect(decorateToolDefinition(definition(name), name).annotations?.openWorldHint).toBe(true)
    }
    for (const name of ['get_scene', 'get_runtime', 'save_project', 'export_runtime', 'export_svg', 'import_asset']) {
      expect(decorateToolDefinition(definition(name), name).annotations?.openWorldHint).toBe(false)
    }
  })

  it('documents native authoring schema fields without changing their validation keywords', async () => {
    await bootstrapMCPActions()
    const missing: string[] = []
    /** Collect concrete named input fields; arbitrary dynamic map keys have no
     * invented schema property and do not require fabricated documentation. */
    function collect(schema: Record<string, any>, toolName: string, path = ''): void {
      for (const [key, field] of Object.entries(schema.properties ?? {}) as [string, Record<string, any>][]) {
        const name = path ? `${path}.${key}` : key
        if (!field.description?.trim()) missing.push(`${toolName}.${name}`)
        collect(field, toolName, name)
      }
      if (schema.items && !Array.isArray(schema.items)) collect(schema.items, toolName, `${path}[]`)
      for (const branch of ['oneOf', 'anyOf', 'allOf']) for (const child of schema[branch] ?? []) collect(child, toolName, path)
    }
    for (const native of actionRegistry.toMCPTools()) {
      const decorated = decorateToolDefinition(native, native.name)
      collect(decorated.inputSchema, native.name)
    }
    expect(missing).toEqual([])
  })
})
