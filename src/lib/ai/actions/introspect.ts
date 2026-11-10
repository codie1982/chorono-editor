// ── Introspection (Read) Actions — BL-01 Faz 2 Agent Loop ─────────────────────
// Read-only tools the AI uses to query → reason → continue. They never mutate;
// each returns a string fed back to the LLM as a tool_result.

import type { ActionRegistry } from '../ActionRegistry'
import type { ChronoScene } from '@/lib/types'
import { describeAuthoring } from '../../editor/authoring/AuthoringQuery'
import { evaluateTimelines } from '@/lib/evaluator'

interface LayerIdParam { layerId: string }
interface TimelineIdParam { timelineId: string }
interface EvalParam { timeMs: number; target?: string }

/** Register source-only reads used by AI/MCP adapters. Reads return the legacy
 * text/JSON representation without mutating scene, transport or media assets. */
export function registerIntrospectActions(reg: ActionRegistry): void {
  // ── list_layers ─────────────────────────────────────────────────────────────
  reg.register({
    id: 'introspect.listLayers',
    toolName: 'list_layers',
    description:
      'List all layers in the scene (terse): id, type, name, visibility. ' +
      'Use to discover what exists before editing.',
    parameters: { type: 'object', properties: {} },
    read: (_params, scene: ChronoScene) => {
      if (scene.layers.length === 0) return 'Scene has no layers.'
      return scene.layers
        .map((l) => {
          const kind = l.shapeKind ?? l.shape ?? l.type
          const hidden = l.hidden ? ' [hidden]' : ''
          return `- id="${l.id}" name="${l.name}" type=${l.type}${kind !== l.type ? ` kind=${kind}` : ''}${hidden}`
        })
        .join('\n')
    },
  })

  // ── list_assets ───────────────────────────────────────────────────────────────
  reg.register({
    id: 'introspect.listAssets',
    toolName: 'list_assets',
    description:
      'List uploaded media assets (image/video/audio) with their ids. Use to find a ' +
      'valid assetId before creating media layers. To add new file content through MCP, use import_asset with base64 data; this list does not import media or fetch URLs.',
    parameters: { type: 'object', properties: {} },
    read: (_params, scene: ChronoScene) => {
      if (scene.assets.length === 0) return 'Scene has no assets. Import file content with import_asset through MCP, or upload media in the editor.'
      return scene.assets
        .map((a) => {
          const dim = a.width && a.height ? ` ${a.width}×${a.height}` : ''
          const dur = a.durationMs ? ` ${a.durationMs}ms` : ''
          return `- id="${a.id}" name="${a.name}" type=${a.type}${dim}${dur}`
        })
        .join('\n')
    },
  })

  // ── describe_layer ──────────────────────────────────────────────────────────
  reg.register<LayerIdParam>({
    id: 'introspect.describeLayer',
    toolName: 'describe_layer',
    description: 'Detailed dump of one layer (transform, opacity, size, style, type-specific data).',
    parameters: {
      type: 'object',
      required: ['layerId'],
      properties: { layerId: { type: 'string', description: 'Layer id to describe' } },
    },
    read: (p, scene: ChronoScene) => {
      const l = scene.layers.find((x) => x.id === p.layerId)
      if (!l) return `No layer with id "${p.layerId}". Use list_layers to see valid ids.`
      const t = l.transform
      const lines = [
        `id="${l.id}" name="${l.name}" type=${l.type}`,
        `transform: pos=(${t.x},${t.y}) scale=(${t.scaleX},${t.scaleY}) rot=${t.rotationDeg}° anchor=(${t.anchorX},${t.anchorY})`,
        `opacity: ${l.opacity}`,
      ]
      lines.push(`authoring (self): ${JSON.stringify(describeAuthoring(scene, ['layer', l.id]))}`)
      if (l.type === 'group' || l.type === 'spline') lines.push(`authoring (subtree): ${JSON.stringify(describeAuthoring(scene, ['layer', l.id], true))}`)
      if (l.size) lines.push(`size: ${l.size.width}×${l.size.height}`)
      if (l.shapeKind || l.shape) lines.push(`shape: ${l.shapeKind ?? l.shape}`)
      if (l.style?.fill) lines.push(`fill: ${JSON.stringify(l.style.fill)}`)
      if (l.style?.stroke) lines.push(`stroke: ${JSON.stringify(l.style.stroke)}`)
      if (l.text) lines.push(`text: "${l.text.value}" fs=${l.text.fontSize} color=${l.text.color}`)
      if (l.startMs != null || l.endMs != null) lines.push(`active: [${l.startMs ?? 0}, ${l.endMs ?? '∞'}]ms`)
      return lines.join('\n')
    },
  })

  // ── describe_timeline ───────────────────────────────────────────────────────
  reg.register<TimelineIdParam>({
    id: 'introspect.describeTimeline',
    toolName: 'describe_timeline',
    description: 'List a timeline\'s tracks and their keyframes (target, times, values).',
    parameters: {
      type: 'object',
      required: ['timelineId'],
      properties: { timelineId: { type: 'string', description: 'Timeline id' } },
    },
    read: (p, scene: ChronoScene) => {
      const tl = scene.timelines.find((x) => x.id === p.timelineId)
      if (!tl) return `No timeline with id "${p.timelineId}".`
      const header = `id="${tl.id}" duration=${tl.durationMs}ms${tl.autoplay ? ' autoplay' : ''}${tl.loop ? ' loop' : ''}`
      if (tl.tracks.length === 0) return `${header}\n(no tracks)`
      const tracks = tl.tracks
        .map((tr) => {
          const kfs = tr.keyframes
            .map((k) => `${k.timeMs}ms=${JSON.stringify(k.value)}${k.easing?.type ? `(${k.easing.type})` : ''}`)
            .join(', ')
          return `  track "${tr.target}" → [${kfs}]`
        })
        .join('\n')
      return `${header}\n${tracks}`
    },
  })

  // ── get_scene_json ──────────────────────────────────────────────────────────
  reg.register({
    id: 'introspect.getSceneJson',
    toolName: 'get_scene_json',
    description: 'Full ChronoScene JSON. Use sparingly (large) — prefer list_layers / describe_*.',
    parameters: { type: 'object', properties: {} },
    read: (_params, scene: ChronoScene) => JSON.stringify(scene),
  })

  // ── evaluate_at_time ────────────────────────────────────────────────────────
  reg.register<EvalParam>({
    id: 'introspect.evaluateAtTime',
    toolName: 'evaluate_at_time',
    description:
      'Compute animated property values at a given time (ms). Optionally filter ' +
      'to one target path (e.g. "layers.ball.transform.y"). Use to VERIFY an animation.',
    parameters: {
      type: 'object',
      required: ['timeMs'],
      properties: {
        timeMs: { type: 'number', description: 'Time in milliseconds to evaluate at' },
        target: { type: 'string', description: 'Optional: only this track target' },
      },
    },
    read: (p, scene: ChronoScene) => {
      const overrides = evaluateTimelines(scene.timelines, p.timeMs)
      if (overrides.size === 0) return `No animated values at ${p.timeMs}ms.`
      const entries = Array.from(overrides.entries())
        .filter(([k]) => !p.target || k === p.target)
        .map(([k, v]) => `${k} = ${v}`)
      if (entries.length === 0) return `No value for "${p.target}" at ${p.timeMs}ms.`
      return `At ${p.timeMs}ms:\n${entries.join('\n')}`
    },
  })
}
