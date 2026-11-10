import Ajv from 'ajv'
import { describe, expect, it } from 'vitest'
import { ActionRegistry } from '../../ActionRegistry'
import { registerKeyframeActions } from '../keyframe'
import { emptyScene, newRectLayer, newTextLayer } from '@/lib/defaults'
import { assertScene } from '@/lib/mcp/protocol'
import { evaluateTimelines } from '@/lib/evaluator'
import type { Layer } from '@/lib/types'

/** Exercise the public action schema and command together: a value accepted
 * by discovery must survive commit validation and evaluate as its typed family. */
function author(property: string, values: unknown[], layer: Layer = newRectLayer()) {
  const registry = new ActionRegistry(); registerKeyframeActions(registry)
  const action = registry.get('add_keyframes')!, scene = emptyScene()
  scene.layers = [layer]; scene.timelines = []
  const args = { timelineId: 'typed', target: `layers.${layer.id}.${property}`,
    keyframes: values.map((value, index) => ({ timeMs: index * 1000, value, easing: 'linear' })) }
  expect(new Ajv({ strict: false }).compile(action.parameters)(args)).toBe(true)
  const command = action.toCommand!(args, scene)!
  const result = command.execute(scene)
  return { action, args, command, result, scene }
}

describe('legacy add_keyframes typed schema and value semantics', () => {
  it('accepts CSS/RGBA/packed colors and evaluates an interpolated color', () => {
    for (const values of [ ['#ff0000', '#0000ff'], [{ r: 255, g: 0, b: 0, a: 255 }, { r: 0, g: 0, b: 255, a: 255 }], [0xff0000, 0x0000ff] ]) {
      const { result, args, command } = author('style.fill.color', values)
      expect(command.label).not.toContain('ERROR')
      expect(() => assertScene(result)).not.toThrow()
      const halfway = evaluateTimelines(result.timelines, 500).get(args.target)
      expect(halfway).not.toEqual(values[0])
      expect(halfway).not.toEqual(values[1])
    }
  })

  it('preserves discrete text, including a numeric-looking string, and booleans', () => {
    const text = author('text.value', ['123', '09:05'], newTextLayer())
    expect(() => assertScene(text.result)).not.toThrow()
    expect(evaluateTimelines(text.result.timelines, 500).get(text.args.target)).toBe('123')
    const flags = author('hidden', [false, true])
    expect(() => assertScene(flags.result)).not.toThrow()
    expect(evaluateTimelines(flags.result.timelines, 500).get(flags.args.target)).toBe(false)
  })

  it('supports vector interpolation and retains numeric-string coercion for numeric source properties', () => {
    const vector = author('custom.vector', [{ x: 0, y: 10 }, { x: 100, y: 30 }])
    expect(() => assertScene(vector.result)).not.toThrow()
    expect(evaluateTimelines(vector.result.timelines, 500).get(vector.args.target)).toEqual({ x: 50, y: 20 })
    const numeric = author('transform.x', ['0', '100'])
    expect(numeric.result.timelines[0].tracks[0].keyframes.map(key => key.value)).toEqual([0, 100])
  })

  it('allows one held key and keeps auto-created timeline, all-layer scope, easing default and undo', () => {
    const value = author('transform.x', [42])
    const command = value.action.toCommand!({ ...value.args, keyframes: [{ timeMs: 25, value: 42 }] }, value.scene)!
    const result = command.execute(value.scene)
    expect(result.timelines[0]).toMatchObject({ id: 'typed', tracks: [{ keyframes: [{ value: 42, easing: { type: 'easeInOut' } }] }] })
    expect(result.timelines[0].layerIds).toBeUndefined()
    expect(command.undo(result)).toEqual(value.scene)
  })

  it('rejects malformed values at the schema or domain boundary without partial scene changes', () => {
    const { action, args, scene } = author('transform.x', [0, 100])
    const validate = new Ajv({ strict: false }).compile(action.parameters)
    expect(validate({ ...args, keyframes: [{ timeMs: 0, value: { x: 1 } }] })).toBe(false)
    expect(validate({ ...args, keyframes: [{ timeMs: 0, value: { r: 256, g: 0, b: 0, a: 255 } }] })).toBe(false)
    const wrongFamily = action.toCommand!({ ...args, keyframes: [{ timeMs: 0, value: 'not numeric' }] }, scene)!
    expect(wrongFamily.label).toMatch(/ERROR/)
    expect(wrongFamily.execute(scene)).toBe(scene)
  })
})
