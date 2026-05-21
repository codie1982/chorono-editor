// ── Interactive AI action tests ───────────────────────────────────────────────
import { describe, it, expect, beforeEach } from 'vitest'
import { ActionRegistry } from '../../ActionRegistry'
import { registerInteractiveActions } from '../interactive'
import { evaluate } from '@/lib/core/expression/expressionEvaluator'
import { emptyScene } from '@/lib/defaults'
import type { ChronoScene, Layer } from '@/lib/types'

function run(reg: ActionRegistry, scene: ChronoScene, tool: string, params: Record<string, unknown>): ChronoScene {
  const def = reg.get(tool)!
  const cmd = def.toCommand!(params, scene)!
  if (cmd.label.startsWith('AI ERROR')) throw new Error(cmd.label)
  return cmd.execute(scene)
}

function stubLayer(id: string): Layer {
  return {
    id, name: id, type: 'shape',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 },
    opacity: 1,
  } as Layer
}

describe('AI interactive actions', () => {
  let reg: ActionRegistry
  beforeEach(() => {
    reg = new ActionRegistry()
    registerInteractiveActions(reg)
  })

  it('adds a typed scene parameter with coerced default', () => {
    const scene = run(reg, emptyScene(), 'add_parameter', {
      id: 'angle', name: 'Angle', type: 'number', defaultValue: '0.5', min: 0, max: 1,
    })
    expect(scene.parameters[0]).toMatchObject({ id: 'angle', type: 'number', defaultValue: 0.5, min: 0, max: 1 })
  })

  it('coerces boolean parameter defaults', () => {
    const scene = run(reg, emptyScene(), 'add_parameter', { id: 'on', type: 'boolean', defaultValue: 'true' })
    expect(scene.parameters[0].defaultValue).toBe(true)
  })

  it('adds a parameter wire whose expression evaluates correctly', () => {
    let scene = emptyScene()
    scene = run(reg, scene, 'add_parameter', { id: 'angle', type: 'number', defaultValue: '0.5' })
    scene = run(reg, scene, 'add_parameter_wire', {
      sourceProperty: 'angle',
      targetLayerId: 'box', targetProperty: 'transform.rotationDeg',
      expression: 'map(source,0,1,0,360)',
    })
    const wire = scene.parameterWires![0]
    expect(wire.source).toMatchObject({ propertyPath: 'angle', valueType: 'number' })
    expect(wire.target).toMatchObject({ layerId: 'box', propertyPath: 'transform.rotationDeg' })
    expect(wire.enabled).toBe(true)
    // Runtime parity: the whitelist expression maps the source value as expected.
    expect(evaluate(wire.expression, { source: 0.5, s: 0.5 })).toBe(180)
  })

  it('applies an output clamp when clampMin/Max given', () => {
    const scene = run(reg, emptyScene(), 'add_parameter_wire', {
      sourceProperty: 'p', targetProperty: 'q', expression: 'source', clampMin: 0, clampMax: 100,
    })
    expect(scene.parameterWires![0].clamp).toEqual({ enabled: true, min: 0, max: 100 })
  })

  it('builds an event→action trigger', () => {
    let scene = emptyScene()
    scene.layers = [stubLayer('btn')]
    scene = run(reg, scene, 'add_trigger', {
      eventType: 'click', eventLayerId: 'btn',
      actionType: 'play', actionTimelineId: 'main',
    })
    const t = scene.triggers[0]
    expect(t.event).toMatchObject({ type: 'click', layerId: 'btn' })
    expect(t.actions[0]).toMatchObject({ type: 'play', timelineId: 'main' })
  })

  it('sets layer interactivity flags + drag config', () => {
    let scene = emptyScene()
    scene.layers = [stubLayer('knob')]
    scene = run(reg, scene, 'set_interactive', {
      layerId: 'knob', draggable: true, dragAxis: 'x', dragRange: 150, setsParameter: 'angle',
    })
    const layer = scene.layers[0]
    expect(layer.draggable).toBe(true)
    expect(layer.dragConfig).toMatchObject({ axis: 'x', range: 150, setsParameter: 'angle' })
  })

  it('rejects a trigger on a missing layer', () => {
    expect(() =>
      run(reg, emptyScene(), 'add_trigger', { eventType: 'click', eventLayerId: 'ghost', actionType: 'pause' }),
    ).toThrow(/event layer "ghost" not found/)
  })
})
