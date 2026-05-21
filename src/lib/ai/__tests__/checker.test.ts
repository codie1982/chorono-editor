// ── Checker agent — read-only tool surface (BL-77) ────────────────────────────
import { describe, it, expect, beforeAll } from 'vitest'
import '@/lib/registry'
import { actionRegistry, bootstrapAIActions } from '../ActionRegistry'
import { buildCheckerPrompt } from '../tools'

beforeAll(async () => { await bootstrapAIActions() })

describe('Checker read-only tool surface', () => {
  it('getReadOnly returns only introspection actions (all have read, none mutate)', () => {
    const readOnly = actionRegistry.getReadOnly()
    expect(readOnly.length).toBeGreaterThanOrEqual(5)
    for (const def of readOnly) {
      expect(typeof def.read).toBe('function')
      expect(def.toCommand).toBeUndefined()
    }
  })

  it('toAITools({readOnly:true}) excludes every mutating tool', () => {
    const tools = actionRegistry.toAITools({ readOnly: true })
    const names = tools.map((t) => t.name)
    // Introspection tools present
    expect(names).toContain('list_layers')
    expect(names).toContain('describe_layer')
    expect(names).toContain('evaluate_at_time')
    // Mutating tools absent
    expect(names).not.toContain('add_layer')
    expect(names).not.toContain('run_script')
    expect(names).not.toContain('clear_scene')
  })

  it('full tool set still contains mutating tools', () => {
    const names = actionRegistry.toAITools().map((t) => t.name)
    expect(names).toContain('add_layer')
    expect(names).toContain('run_script')
    expect(names).toContain('list_layers') // read tools are part of full set too
  })

  it('checker prompt is review-focused and forbids mutation', () => {
    const p = buildCheckerPrompt('SCENE')
    expect(p).toContain('read-only')
    expect(p).toMatch(/do NOT build or change|never mutate|only review/i)
    expect(p).toContain('SCENE')
  })
})
