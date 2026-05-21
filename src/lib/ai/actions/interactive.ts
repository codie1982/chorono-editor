// ── Interactive Actions (parameters / triggers / bindings / wires) ────────────
// AI surface over commands-interactive.ts + layer interactivity flags. Lets the
// planner build interactive scenes: scene parameters, event→action triggers,
// linear bindings, expression wires, and tappable/draggable layers.

import type {
  SceneParameter, SceneParameterType, SceneParameterValue,
  Trigger, TriggerEvent, TriggerEventType, TriggerAction, TriggerActionType,
  TriggerCondition, TriggerConditionOp, ParamValueSource,
  Binding, BindingSourceType, BindingTargetType,
  ParameterWire, ParameterRef, ParameterValueType,
  DragConfig, DragAxis, Layer,
} from '@/lib/types'
import {
  makeAddParamCmd, makeAddTriggerCmd, makeAddBindingCmd, makeAddParameterWireCmd,
} from '@/lib/editor/commands-interactive'
import { makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import type { ActionRegistry } from '../ActionRegistry'

const PARAM_TYPE_ENUM: SceneParameterType[] = ['number', 'boolean', 'color', 'string', 'image']
const EVENT_TYPE_ENUM: TriggerEventType[] = [
  'click', 'dragStart', 'dragMove', 'dragEnd',
  'animationStart', 'animationComplete', 'animationLoop',
  'segmentStart', 'segmentComplete',
  'layerAppear', 'layerDisappear', 'layerAnimationComplete',
  'markerReached', 'frameReached', 'customEvent',
]
const ACTION_TYPE_ENUM: TriggerActionType[] = [
  'play', 'pause', 'stop', 'reverse', 'seek', 'playSegment', 'setParam', 'emitEvent',
]
const COND_OP_ENUM: TriggerConditionOp[] = ['eq', 'neq', 'gt', 'lt', 'gte', 'lte']
const PARAM_VALUE_FROM_ENUM: ParamValueSource[] = ['event.progress', 'event.dx', 'event.dy']
const BINDING_SOURCE_ENUM: BindingSourceType[] = ['layerProperty', 'parameter']
const BINDING_TARGET_ENUM: BindingTargetType[] = ['layerProperty', 'timelineProgress', 'parameter']
const VALUE_TYPE_ENUM: ParameterValueType[] = ['number', 'boolean', 'string', 'color', 'vec2']
const DRAG_AXIS_ENUM: DragAxis[] = ['x', 'y', 'both']

let seq = 0
const uid = (p: string) => `${p}_ai_${Date.now()}_${++seq}`

// ── Param types ───────────────────────────────────────────────────────────────

interface AddParamParams {
  id: string; name?: string; type?: SceneParameterType
  defaultValue?: SceneParameterValue; min?: number; max?: number
}
interface AddTriggerParams {
  id?: string; label?: string
  eventType: TriggerEventType; eventLayerId?: string; eventTimelineId?: string
  eventSegmentId?: string; eventRefId?: string
  actionType: TriggerActionType; actionTimelineId?: string; actionSegmentId?: string
  actionTimeMs?: number; actionLoop?: boolean
  actionParamId?: string; actionParamValue?: SceneParameterValue; actionParamValueFrom?: ParamValueSource
  actionEventName?: string
  condPath?: string; condOp?: TriggerConditionOp; condValue?: number | boolean | string
}
interface AddBindingParams {
  id?: string
  sourceType: BindingSourceType; sourceLayerId?: string; sourceProperty?: string; sourceParamId?: string
  targetType: BindingTargetType; targetLayerId?: string; targetProperty?: string
  targetTimelineId?: string; targetParamId?: string
  inputMin?: number; inputMax?: number; outputMin?: number; outputMax?: number
  clamp?: boolean; reverse?: boolean
}
interface AddWireParams {
  id?: string; name?: string; enabled?: boolean
  sourceLayerId?: string; sourceProperty: string; sourceValueType?: ParameterValueType
  targetLayerId?: string; targetProperty: string; targetValueType?: ParameterValueType
  expression: string; blendMode?: 'override' | 'add'
  clampMin?: number; clampMax?: number
}
interface SetInteractiveParams {
  layerId: string; tappable?: boolean; draggable?: boolean
  dragAxis?: DragAxis; dragRange?: number; followCursor?: boolean
  setsParameter?: string; scrubsTimeline?: string
}

// ── Registration ──────────────────────────────────────────────────────────────

export function registerInteractiveActions(reg: ActionRegistry): void {
  // ── add_parameter ─────────────────────────────────────────────────────────
  reg.register<AddParamParams>({
    id: 'param.add',
    toolName: 'add_parameter',
    description:
      'Add a scene parameter — a named runtime value (number/boolean/color/string) that ' +
      'triggers, bindings, wires, and state-machine guards can read and write.',
    parameters: {
      type: 'object',
      required: ['id'],
      properties: {
        id:           { type: 'string', description: 'Unique parameter id e.g. "score"' },
        name:         { type: 'string', description: 'Display name' },
        type:         { type: 'string', enum: PARAM_TYPE_ENUM, description: 'Parameter type (default number)' },
        defaultValue: { type: 'string', description: 'Initial value (number/bool/hex color/string)' },
        min:          { type: 'number', description: 'Min (number params) — drives slider range' },
        max:          { type: 'number', description: 'Max (number params)' },
      },
    },
    toCommand: (p, scene) => {
      if (!p.id) return errorCmd('add_parameter missing id')
      if (scene.parameters.some((x) => x.id === p.id)) {
        return errorCmd(`parameter id "${p.id}" already exists`)
      }
      const type = p.type ?? 'number'
      const param: SceneParameter = {
        id: p.id, name: p.name ?? p.id, type,
        defaultValue: coerceParamValue(type, p.defaultValue),
        ...(type === 'number' && p.min != null ? { min: p.min } : {}),
        ...(type === 'number' && p.max != null ? { max: p.max } : {}),
      }
      return makeAddParamCmd(param)
    },
  })

  // ── add_trigger ───────────────────────────────────────────────────────────
  reg.register<AddTriggerParams>({
    id: 'trigger.add',
    toolName: 'add_trigger',
    description:
      'Add an event→action rule. When `eventType` fires (optionally on a layer/timeline), ' +
      'run one action (play/pause/seek a timeline, setParam, emitEvent…). Add an optional ' +
      'condition (condPath/condOp/condValue) to gate it. For click events, the layer must be ' +
      'tappable (set_interactive); for drag events, draggable.',
    parameters: {
      type: 'object',
      required: ['eventType', 'actionType'],
      properties: {
        id:            { type: 'string', description: 'Optional trigger id' },
        label:         { type: 'string', description: 'Human label for the Events panel' },
        eventType:     { type: 'string', enum: EVENT_TYPE_ENUM, description: 'Event that fires the rule' },
        eventLayerId:  { type: 'string', description: 'Layer for click/drag/layer* events' },
        eventTimelineId: { type: 'string', description: 'Timeline for animation* events' },
        eventSegmentId:  { type: 'string', description: 'Segment for segment* events' },
        eventRefId:    { type: 'string', description: 'Marker id (markerReached) or event name (customEvent)' },
        actionType:    { type: 'string', enum: ACTION_TYPE_ENUM, description: 'Action to run' },
        actionTimelineId: { type: 'string', description: 'Target timeline for play/pause/stop/reverse/seek' },
        actionSegmentId:  { type: 'string', description: 'Segment id for playSegment' },
        actionTimeMs:  { type: 'number', description: 'Target time (ms) for seek' },
        actionLoop:    { type: 'boolean', description: 'Loop flag for playSegment' },
        actionParamId: { type: 'string', description: 'Parameter id for setParam' },
        actionParamValue: { type: 'string', description: 'Static value for setParam' },
        actionParamValueFrom: { type: 'string', enum: PARAM_VALUE_FROM_ENUM, description: 'Dynamic setParam source from the firing event' },
        actionEventName: { type: 'string', description: 'Event name for emitEvent' },
        condPath:      { type: 'string', description: 'Condition path e.g. "params.score"' },
        condOp:        { type: 'string', enum: COND_OP_ENUM, description: 'Condition operator' },
        condValue:     { type: 'string', description: 'Condition comparison value' },
      },
    },
    toCommand: (p, scene) => {
      if (!p.eventType || !p.actionType) return errorCmd('add_trigger missing eventType / actionType')
      if (p.eventLayerId && !scene.layers.some((l) => l.id === p.eventLayerId)) {
        return errorCmd(`event layer "${p.eventLayerId}" not found`)
      }
      const event: TriggerEvent = {
        type: p.eventType,
        ...(p.eventLayerId    ? { layerId:    p.eventLayerId }    : {}),
        ...(p.eventTimelineId ? { timelineId: p.eventTimelineId } : {}),
        ...(p.eventSegmentId  ? { segmentId:  p.eventSegmentId }  : {}),
        ...(p.eventRefId      ? { refId:      p.eventRefId }      : {}),
      }
      const action: TriggerAction = {
        type: p.actionType,
        ...(p.actionTimelineId ? { timelineId: p.actionTimelineId } : {}),
        ...(p.actionSegmentId  ? { segmentId:  p.actionSegmentId }  : {}),
        ...(p.actionTimeMs != null ? { timeMs:  p.actionTimeMs }    : {}),
        ...(p.actionLoop   != null ? { loop:    p.actionLoop }      : {}),
        ...(p.actionParamId    ? { paramId:    p.actionParamId }    : {}),
        ...(p.actionParamValue != null ? { paramValue: coerceLooseValue(p.actionParamValue) } : {}),
        ...(p.actionParamValueFrom ? { paramValueFrom: p.actionParamValueFrom } : {}),
        ...(p.actionEventName  ? { eventName:  p.actionEventName }  : {}),
      }
      let condition: TriggerCondition | undefined
      if (p.condPath) {
        if (!p.condOp || p.condValue == null) {
          return errorCmd('trigger condition needs condPath, condOp and condValue together')
        }
        condition = { path: p.condPath, op: p.condOp, value: coerceLooseValue(p.condValue) }
      }
      const trigger: Trigger = {
        id: p.id ?? uid('trigger'),
        ...(p.label ? { label: p.label } : {}),
        event,
        ...(condition ? { condition } : {}),
        actions: [action],
      }
      return makeAddTriggerCmd(trigger)
    },
  })

  // ── add_binding ───────────────────────────────────────────────────────────
  reg.register<AddBindingParams>({
    id: 'binding.add',
    toolName: 'add_binding',
    description:
      'Add a linear binding that remaps a source (parameter or layer property) onto a target ' +
      '(layer property / timeline progress / parameter) via inputMin→outputMin … inputMax→outputMax.',
    parameters: {
      type: 'object',
      required: ['sourceType', 'targetType'],
      properties: {
        id:               { type: 'string', description: 'Optional binding id' },
        sourceType:       { type: 'string', enum: BINDING_SOURCE_ENUM, description: 'Source kind' },
        sourceLayerId:    { type: 'string', description: 'Source layer (layerProperty)' },
        sourceProperty:   { type: 'string', description: 'Source dot-path e.g. "transform.x"' },
        sourceParamId:    { type: 'string', description: 'Source parameter id (parameter)' },
        targetType:       { type: 'string', enum: BINDING_TARGET_ENUM, description: 'Target kind' },
        targetLayerId:    { type: 'string', description: 'Target layer (layerProperty)' },
        targetProperty:   { type: 'string', description: 'Target dot-path' },
        targetTimelineId: { type: 'string', description: 'Target timeline (timelineProgress)' },
        targetParamId:    { type: 'string', description: 'Target parameter id (parameter)' },
        inputMin:  { type: 'number', description: 'Input range low (default 0)' },
        inputMax:  { type: 'number', description: 'Input range high (default 1)' },
        outputMin: { type: 'number', description: 'Output range low (default 0)' },
        outputMax: { type: 'number', description: 'Output range high (default 1)' },
        clamp:     { type: 'boolean', description: 'Clamp output to range (default true)' },
        reverse:   { type: 'boolean', description: 'Reverse mapping (default false)' },
      },
    },
    toCommand: (p, scene) => {
      if (!p.sourceType || !p.targetType) return errorCmd('add_binding missing sourceType / targetType')
      const binding: Binding = {
        id: p.id ?? uid('binding'),
        source: {
          type: p.sourceType,
          ...(p.sourceLayerId ? { layerId: p.sourceLayerId } : {}),
          ...(p.sourceProperty ? { property: p.sourceProperty } : {}),
          ...(p.sourceParamId ? { paramId: p.sourceParamId } : {}),
        },
        target: {
          type: p.targetType,
          ...(p.targetLayerId ? { layerId: p.targetLayerId } : {}),
          ...(p.targetProperty ? { property: p.targetProperty } : {}),
          ...(p.targetTimelineId ? { timelineId: p.targetTimelineId } : {}),
          ...(p.targetParamId ? { paramId: p.targetParamId } : {}),
        },
        map: {
          inputMin:  p.inputMin  ?? 0,
          inputMax:  p.inputMax  ?? 1,
          outputMin: p.outputMin ?? 0,
          outputMax: p.outputMax ?? 1,
          ...(p.clamp   != null ? { clamp:   p.clamp }   : {}),
          ...(p.reverse != null ? { reverse: p.reverse } : {}),
        },
      }
      void scene
      return makeAddBindingCmd(binding)
    },
  })

  // ── add_parameter_wire ────────────────────────────────────────────────────
  reg.register<AddWireParams>({
    id: 'wire.add',
    toolName: 'add_parameter_wire',
    description:
      'Add an expression-driven wire. The source value is bound as `source` (alias `s`) in a ' +
      'whitelist expression — map/clamp/lerp/min/max/abs/round/floor/ceil/sin/cos/tan/sqrt/pow/' +
      'smoothstep — e.g. "map(source,0,1,0,360)". Source/target are scene params (propertyPath = ' +
      'param id, no layerId) or layer properties (layerId + dot-path).',
    parameters: {
      type: 'object',
      required: ['sourceProperty', 'targetProperty', 'expression'],
      properties: {
        id:              { type: 'string', description: 'Optional wire id' },
        name:            { type: 'string', description: 'Optional wire name' },
        enabled:         { type: 'boolean', description: 'Enabled (default true)' },
        sourceLayerId:   { type: 'string', description: 'Source layer id (omit for a scene parameter)' },
        sourceProperty:  { type: 'string', description: 'Source dot-path, or param id for a scene param' },
        sourceValueType: { type: 'string', enum: VALUE_TYPE_ENUM, description: 'Source value type (default number)' },
        targetLayerId:   { type: 'string', description: 'Target layer id (omit for a scene parameter)' },
        targetProperty:  { type: 'string', description: 'Target dot-path, or param id for a scene param' },
        targetValueType: { type: 'string', enum: VALUE_TYPE_ENUM, description: 'Target value type (default number)' },
        expression:      { type: 'string', description: 'e.g. "map(source,0,1,0,360)"' },
        blendMode:       { type: 'string', enum: ['override', 'add'], description: 'Default override' },
        clampMin:        { type: 'number', description: 'Optional output clamp min' },
        clampMax:        { type: 'number', description: 'Optional output clamp max' },
      },
    },
    toCommand: (p, scene) => {
      if (!p.sourceProperty || !p.targetProperty || !p.expression) {
        return errorCmd('add_parameter_wire missing sourceProperty / targetProperty / expression')
      }
      const source: ParameterRef = {
        ...(p.sourceLayerId ? { layerId: p.sourceLayerId } : {}),
        propertyPath: p.sourceProperty,
        valueType: p.sourceValueType ?? 'number',
      }
      const target: ParameterRef = {
        ...(p.targetLayerId ? { layerId: p.targetLayerId } : {}),
        propertyPath: p.targetProperty,
        valueType: p.targetValueType ?? 'number',
      }
      const now = Date.now()
      const wire: ParameterWire = {
        id: p.id ?? uid('wire'),
        ...(p.name ? { name: p.name } : {}),
        enabled: p.enabled ?? true,
        source, target,
        expression: p.expression,
        blendMode: p.blendMode ?? 'override',
        ...(p.clampMin != null || p.clampMax != null
          ? { clamp: { enabled: true,
              ...(p.clampMin != null ? { min: p.clampMin } : {}),
              ...(p.clampMax != null ? { max: p.clampMax } : {}) } }
          : {}),
        createdAt: now, updatedAt: now,
      }
      void scene
      return makeAddParameterWireCmd(wire)
    },
  })

  // ── set_interactive ───────────────────────────────────────────────────────
  reg.register<SetInteractiveParams>({
    id: 'layer.setInteractive',
    toolName: 'set_interactive',
    description:
      'Make a layer interactive: tappable (fires click triggers) and/or draggable (fires drag ' +
      'events). Drag can follow the cursor, drive a parameter (setsParameter), or scrub a ' +
      'timeline (scrubsTimeline).',
    parameters: {
      type: 'object',
      required: ['layerId'],
      properties: {
        layerId:       { type: 'string', description: 'Layer to make interactive' },
        tappable:      { type: 'boolean', description: 'Fire click triggers on tap' },
        draggable:     { type: 'boolean', description: 'Enable dragging' },
        dragAxis:      { type: 'string', enum: DRAG_AXIS_ENUM, description: 'Drag axis (default both)' },
        dragRange:     { type: 'number', description: 'Px distance for progress=1 (default 200)' },
        followCursor:  { type: 'boolean', description: 'Layer follows cursor while dragging' },
        setsParameter: { type: 'string', description: 'Parameter id set with drag progress 0-1' },
        scrubsTimeline:{ type: 'string', description: 'Timeline id scrubbed by drag progress' },
      },
    },
    toCommand: (p, scene) => {
      if (!p.layerId) return errorCmd('set_interactive missing layerId')
      const prev = scene.layers.find((l) => l.id === p.layerId)
      if (!prev) return errorCmd(`layer "${p.layerId}" not found`)
      const patch: Partial<Layer> = {}
      if (p.tappable  != null) patch.tappable  = p.tappable
      if (p.draggable != null) patch.draggable = p.draggable
      const drag: DragConfig = {
        ...prev.dragConfig,
        ...(p.dragAxis      != null ? { axis:          p.dragAxis }      : {}),
        ...(p.dragRange     != null ? { range:         p.dragRange }     : {}),
        ...(p.followCursor  != null ? { followCursor:  p.followCursor }  : {}),
        ...(p.setsParameter != null ? { setsParameter: p.setsParameter } : {}),
        ...(p.scrubsTimeline!= null ? { scrubsTimeline:p.scrubsTimeline }: {}),
      }
      if (Object.keys(drag).length) patch.dragConfig = drag
      return makeUpdateLayerCmd(p.layerId, patch, prev)
    },
  })
}

// ── Coercion helpers ────────────────────────────────────────────────────────

function coerceParamValue(type: SceneParameterType, raw: unknown): SceneParameterValue {
  if (type === 'boolean') {
    if (typeof raw === 'boolean') return raw
    return raw === 'true' || raw === true
  }
  if (type === 'number') {
    const n = Number(raw)
    return Number.isFinite(n) ? n : 0
  }
  // string / color / image
  if (raw == null) return type === 'color' ? '#FFFFFF' : ''
  return String(raw)
}

/** Best-effort coercion for loosely-typed string inputs (trigger/condition values). */
function coerceLooseValue(raw: number | boolean | string): number | boolean | string {
  if (typeof raw !== 'string') return raw
  if (raw === 'true') return true
  if (raw === 'false') return false
  const n = Number(raw)
  return Number.isFinite(n) && raw.trim() !== '' ? n : raw
}

function errorCmd(message: string) {
  return {
    label: `AI ERROR: ${message}`,
    execute: <S,>(s: S): S => s,
    undo:    <S,>(s: S): S => s,
  }
}
