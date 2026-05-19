'use client'
// ── EventsPanel ───────────────────────────────────────────────────────────────
// Visual editor for ChronoScene.triggers. Each trigger is a "rule card":
//
//   WHEN  [event type ▼]  [layer / segment / etc ▼]
//   IF    [path] [op] [value]    (optional)
//   THEN  one or more actions ([action type ▼] + contextual targets)
//
// Authoring is fully no-code: every dropdown / input dispatches an
// EditorCommand. Runtime evaluation lives in src/lib/runtime/triggerEngine.ts.

import { useState } from 'react'
import type {
  ChronoScene,
  Trigger, TriggerEvent, TriggerEventType,
  TriggerAction, TriggerActionType, TriggerCondition, TriggerConditionOp,
} from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { newTrigger } from '@/lib/defaults'
import {
  makeAddTriggerCmd, makeDeleteTriggerCmd, makeUpdateTriggerCmd,
} from '@/lib/editor/commands-interactive'
import ContextMenu, { useContextMenu } from '@/components/ui/ContextMenu'

interface Props {
  scene: ChronoScene
  editor: EditorStateReturn
}

const EVENT_TYPES: TriggerEventType[] = [
  'click', 'dragStart', 'dragMove', 'dragEnd',
  'animationStart', 'animationComplete', 'animationLoop',
  'segmentStart', 'segmentComplete',
  'layerAppear', 'layerDisappear', 'layerAnimationComplete',
  'markerReached', 'frameReached', 'customEvent',
]

const ACTION_TYPES: TriggerActionType[] = [
  'play', 'pause', 'stop', 'reverse', 'seek',
  'playSegment', 'setParam', 'emitEvent',
]

const COND_OPS: TriggerConditionOp[] = ['eq', 'neq', 'gt', 'lt', 'gte', 'lte']

export default function EventsPanel({ scene, editor }: Props) {
  return (
    <div className="flex flex-col h-full text-xs text-gray-300">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          Events
        </span>
        <button
          onClick={() => editor.dispatchCommand(makeAddTriggerCmd(newTrigger()))}
          className="text-[11px] px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
        >
          + Add Rule
        </button>
      </div>

      {scene.triggers.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-4 text-center text-[11px] text-gray-500">
          No event rules yet. Add a rule to react to clicks, animation
          lifecycle, markers or custom events from your host platform.
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {scene.triggers.map((t) => (
          <TriggerCard key={t.id} trigger={t} scene={scene} editor={editor} />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Trigger card
// ─────────────────────────────────────────────────────────────────────────────

function TriggerCard({
  trigger, scene, editor,
}: {
  trigger: Trigger
  scene: ChronoScene
  editor: EditorStateReturn
}) {
  const ctxMenu = useContextMenu()

  function patch(next: Partial<Trigger>) {
    const updated: Trigger = { ...trigger, ...next }
    editor.dispatchCommand(makeUpdateTriggerCmd(trigger.id, trigger, updated))
  }
  function patchEvent(next: Partial<TriggerEvent>) {
    patch({ event: { ...trigger.event, ...next } })
  }
  function patchActions(actions: TriggerAction[]) {
    patch({ actions })
  }
  function duplicate() {
    const dup: Trigger = {
      ...newTrigger(),
      event:     trigger.event,
      condition: trigger.condition,
      actions:   trigger.actions,
      label:     (trigger.label ?? 'Rule') + ' copy',
    }
    editor.dispatchCommand(makeAddTriggerCmd(dup))
  }

  return (
    <div
      className="px-3 py-2 border-b border-gray-800"
      onContextMenu={(e) => { e.preventDefault(); ctxMenu.open(e) }}
    >
      {/* Label + delete */}
      <div className="flex items-center gap-2 mb-1.5">
        <input
          className="flex-1 bg-transparent border-b border-transparent focus:border-gray-500 outline-none text-[11px] text-gray-200"
          value={trigger.label ?? ''}
          placeholder="Rule name"
          onChange={(e) => patch({ label: e.target.value })}
        />
        <button
          className="text-[10px] text-red-400 hover:text-red-300"
          onClick={() => editor.dispatchCommand(makeDeleteTriggerCmd(trigger))}
          title="Delete rule"
        >
          ✕
        </button>
      </div>

      {/* WHEN row */}
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[9px] uppercase font-semibold text-amber-400 w-10">WHEN</span>
        <Select
          value={trigger.event.type}
          onChange={(v) => patchEvent({ type: v as TriggerEventType })}
          options={EVENT_TYPES.map((t) => ({ value: t, label: t }))}
        />
        <EventDiscriminator event={trigger.event} scene={scene} onChange={patchEvent} />
      </div>

      {/* IF row (optional) */}
      <ConditionRow
        condition={trigger.condition}
        scene={scene}
        onChange={(c) => patch({ condition: c })}
      />

      {/* THEN rows */}
      <div className="space-y-1">
        {trigger.actions.map((action, i) => (
          <ActionRow
            key={i}
            action={action}
            scene={scene}
            onChange={(next) => {
              const copy = trigger.actions.slice()
              copy[i] = next
              patchActions(copy)
            }}
            onDelete={() => patchActions(trigger.actions.filter((_, idx) => idx !== i))}
          />
        ))}
        <button
          className="text-[10px] text-emerald-400 hover:text-emerald-300 ml-12"
          onClick={() => patchActions([
            ...trigger.actions,
            { type: 'play' } as TriggerAction,
          ])}
        >
          + add action
        </button>
      </div>

      {ctxMenu.isOpen && (
        <ContextMenu
          x={ctxMenu.state!.x} y={ctxMenu.state!.y}
          items={[
            {
              kind: 'action', label: 'Duplicate Rule',
              onSelect: () => { duplicate(); ctxMenu.close() },
            },
            { kind: 'separator' },
            {
              kind: 'action', label: 'Delete Rule',
              onSelect: () => { editor.dispatchCommand(makeDeleteTriggerCmd(trigger)); ctxMenu.close() },
            },
          ]}
          onClose={ctxMenu.close}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Discriminator (layer / segment / refId picker by event type)
// ─────────────────────────────────────────────────────────────────────────────

function EventDiscriminator({
  event, scene, onChange,
}: {
  event: TriggerEvent
  scene: ChronoScene
  onChange: (patch: Partial<TriggerEvent>) => void
}) {
  switch (event.type) {
    case 'click':
    case 'dragStart':
    case 'dragMove':
    case 'dragEnd':
    case 'layerAppear':
    case 'layerDisappear':
    case 'layerAnimationComplete':
      return (
        <Select
          value={event.layerId ?? ''}
          onChange={(v) => onChange({ layerId: v || undefined })}
          options={[
            { value: '', label: '(any layer)' },
            ...scene.layers.map((l) => ({ value: l.id, label: l.name })),
          ]}
        />
      )
    case 'segmentStart':
    case 'segmentComplete':
      return (
        <Select
          value={event.segmentId ?? ''}
          onChange={(v) => onChange({ segmentId: v || undefined })}
          options={[
            { value: '', label: '(any segment)' },
            ...allSegments(scene).map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
      )
    case 'animationStart':
    case 'animationComplete':
    case 'animationLoop':
      return (
        <Select
          value={event.timelineId ?? ''}
          onChange={(v) => onChange({ timelineId: v || undefined })}
          options={[
            { value: '', label: '(any timeline)' },
            ...scene.timelines.map((t) => ({ value: t.id, label: t.id })),
          ]}
        />
      )
    case 'markerReached':
      return (
        <Select
          value={event.refId ?? ''}
          onChange={(v) => onChange({ refId: v || undefined })}
          options={[
            { value: '', label: '(any marker)' },
            ...allMarkers(scene).map((m) => ({ value: m.id, label: m.label || m.id })),
          ]}
        />
      )
    case 'frameReached':
      return (
        <input
          type="number"
          className="bg-gray-900 border border-gray-700 rounded px-2 py-0.5 text-[11px] text-gray-100 outline-none w-20"
          value={event.frameNumber ?? 0}
          onChange={(e) => onChange({ frameNumber: Number(e.target.value) })}
        />
      )
    case 'customEvent':
      return (
        <input
          className="bg-gray-900 border border-gray-700 rounded px-2 py-0.5 text-[11px] text-gray-100 outline-none flex-1 font-mono"
          value={event.refId ?? ''}
          placeholder="event.name"
          onChange={(e) => onChange({ refId: e.target.value })}
        />
      )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Condition row
// ─────────────────────────────────────────────────────────────────────────────

function ConditionRow({
  condition, scene, onChange,
}: {
  condition: TriggerCondition | undefined
  scene: ChronoScene
  onChange: (c: TriggerCondition | undefined) => void
}) {
  if (!condition) {
    return (
      <button
        className="text-[10px] text-blue-400 hover:text-blue-300 ml-12 mb-1"
        onClick={() => onChange({ path: 'params.', op: 'eq', value: '' })}
      >
        + add condition
      </button>
    )
  }
  return (
    <div className="flex items-center gap-1.5 mb-1">
      <span className="text-[9px] uppercase font-semibold text-blue-400 w-10">IF</span>
      <Select
        value={condition.path}
        onChange={(v) => onChange({ ...condition, path: v })}
        options={[
          { value: 'params.', label: '(custom path)' },
          ...scene.parameters.map((p) => ({ value: `params.${p.id}`, label: `params.${p.id}` })),
        ]}
      />
      <Select
        value={condition.op}
        onChange={(v) => onChange({ ...condition, op: v as TriggerConditionOp })}
        options={COND_OPS.map((o) => ({ value: o, label: o }))}
      />
      <input
        className="bg-gray-900 border border-gray-700 rounded px-2 py-0.5 text-[11px] text-gray-100 outline-none flex-1"
        value={String(condition.value ?? '')}
        onChange={(e) => onChange({ ...condition, value: maybeNumber(e.target.value) })}
      />
      <button className="text-[10px] text-gray-500 hover:text-red-400" onClick={() => onChange(undefined)}>
        ✕
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Action row
// ─────────────────────────────────────────────────────────────────────────────

function ActionRow({
  action, scene, onChange, onDelete,
}: {
  action: TriggerAction
  scene: ChronoScene
  onChange: (next: TriggerAction) => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] uppercase font-semibold text-emerald-400 w-10">THEN</span>
      <Select
        value={action.type}
        onChange={(v) => onChange({ ...action, type: v as TriggerActionType })}
        options={ACTION_TYPES.map((t) => ({ value: t, label: t }))}
      />
      <ActionTargets action={action} scene={scene} onChange={onChange} />
      <button className="text-[10px] text-gray-500 hover:text-red-400" onClick={onDelete}>
        ✕
      </button>
    </div>
  )
}

function ActionTargets({
  action, scene, onChange,
}: {
  action: TriggerAction
  scene: ChronoScene
  onChange: (next: TriggerAction) => void
}) {
  switch (action.type) {
    case 'playSegment':
      return (
        <Select
          value={action.segmentId ?? ''}
          onChange={(v) => onChange({ ...action, segmentId: v || undefined })}
          options={[
            { value: '', label: '(pick)' },
            ...allSegments(scene).map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
      )
    case 'play': case 'pause': case 'stop': case 'reverse':
      return (
        <Select
          value={action.timelineId ?? ''}
          onChange={(v) => onChange({ ...action, timelineId: v || undefined })}
          options={[
            { value: '', label: '(active timeline)' },
            ...scene.timelines.map((t) => ({ value: t.id, label: t.id })),
          ]}
        />
      )
    case 'seek':
      return (
        <input
          type="number"
          className="bg-gray-900 border border-gray-700 rounded px-2 py-0.5 text-[11px] text-gray-100 outline-none w-24"
          placeholder="time (ms)"
          value={action.timeMs ?? 0}
          onChange={(e) => onChange({ ...action, timeMs: Number(e.target.value) })}
        />
      )
    case 'setParam':
      return (
        <>
          <Select
            value={action.paramId ?? ''}
            onChange={(v) => onChange({ ...action, paramId: v || undefined })}
            options={[
              { value: '', label: '(pick)' },
              ...scene.parameters.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
          {/* Value SOURCE: static literal OR pulled from event payload
              (drag dx / dy / progress). When a non-static source is chosen
              the literal input is greyed out — only meaningful for drag/scroll
              event triggers. */}
          <Select
            value={action.paramValueFrom ?? ''}
            onChange={(v) => onChange({
              ...action,
              paramValueFrom: (v || undefined) as any,
            })}
            options={[
              { value: '',               label: '= (static)' },
              { value: 'event.progress', label: '← event.progress (0-1)' },
              { value: 'event.dx',       label: '← event.dx (px)' },
              { value: 'event.dy',       label: '← event.dy (px)' },
            ]}
          />
          <input
            className={`bg-gray-900 border border-gray-700 rounded px-2 py-0.5 text-[11px] outline-none flex-1
              ${action.paramValueFrom ? 'text-gray-600 italic line-through' : 'text-gray-100'}`}
            placeholder={action.paramValueFrom ? '(from event)' : 'value'}
            disabled={!!action.paramValueFrom}
            value={action.paramValueFrom ? '' : String(action.paramValue ?? '')}
            onChange={(e) => onChange({ ...action, paramValue: maybeNumber(e.target.value) })}
          />
        </>
      )
    case 'emitEvent':
      return (
        <input
          className="bg-gray-900 border border-gray-700 rounded px-2 py-0.5 text-[11px] text-gray-100 outline-none flex-1 font-mono"
          placeholder="event.name"
          value={action.eventName ?? ''}
          onChange={(e) => onChange({ ...action, eventName: e.target.value })}
        />
      )
    default:
      return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function Select<T extends string>({
  value, onChange, options,
}: {
  value: T | ''
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[11px] text-gray-100 outline-none focus:border-gray-500"
    >
      {options.map((o) => (
        <option key={o.value || '__empty__'} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

function allSegments(scene: ChronoScene) {
  return scene.timelines.flatMap((t) =>
    (t.segments ?? []).map((s) => ({ id: s.id, name: s.name, timelineId: t.id })),
  )
}
function allMarkers(scene: ChronoScene) {
  return scene.timelines.flatMap((t) => t.markers ?? [])
}

function maybeNumber(v: string): string | number | boolean {
  if (v === 'true')  return true
  if (v === 'false') return false
  const n = Number(v)
  return v !== '' && Number.isFinite(n) ? n : v
}
