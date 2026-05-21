// ── Path & Motion Actions (BL-66 / BL-67 AI surface) ──────────────────────────
// add_path builds a bezier path layer from points; assign_motion_path makes a
// layer follow a path (followPath) and optionally animates progress 0→1;
// trim_path reveals part of a stroke.

import type { Layer, FollowPath, Keyframe } from '@/lib/types'
import { pathFromPoints } from '@/lib/types/path'
import { newBezierPathLayer, newMotionPathLayer } from '@/lib/defaults'
import { makeAddLayerCmd, makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import { upsertKeyframe, ensureLayerInTimeline } from '@/lib/timeline/keyframeOps'
import type { ActionRegistry } from '../ActionRegistry'

const PATH_ROLE_ENUM = ['visual', 'motion']

interface AddPathParams {
  id: string
  name?: string
  points: number[][]
  closed?: boolean
  role?: 'visual' | 'motion'
  x?: number; y?: number
  strokeColor?: string
  strokeWidth?: number
}

interface AssignMotionPathParams {
  layerId: string
  pathLayerId: string
  orientToPath?: boolean
  rotationOffset?: number
  perpendicularOffset?: number
  animateMs?: number
  timelineId?: string
}

interface TrimPathParams {
  layerId: string
  start?: number
  end?: number
  offset?: number
}

export function registerPathActions(reg: ActionRegistry): void {
  // ── add_path ──────────────────────────────────────────────────────────────
  reg.register<AddPathParams>({
    id: 'path.add',
    toolName: 'add_path',
    description:
      'Create a bezier path layer from an array of [x,y] points. role="visual" draws a ' +
      'stroke; role="motion" is an invisible guide for assign_motion_path. Points are in ' +
      'layer-local px; set x/y to position the path.',
    parameters: {
      type: 'object',
      required: ['id', 'points'],
      properties: {
        id:    { type: 'string', description: 'Unique layer id' },
        name:  { type: 'string', description: 'Display name' },
        points: {
          type: 'array',
          description: 'Array of [x,y] pairs, e.g. [[0,0],[100,50],[200,0]]',
          items: { type: 'array', items: { type: 'number' } },
        },
        closed:      { type: 'boolean', description: 'Close the path into a loop (default false)' },
        role:        { type: 'string', enum: PATH_ROLE_ENUM, description: 'visual or motion (default visual)' },
        x:           { type: 'number', description: 'Layer x position' },
        y:           { type: 'number', description: 'Layer y position' },
        strokeColor: { type: 'string', description: 'Stroke hex color' },
        strokeWidth: { type: 'number', description: 'Stroke width in px' },
      },
    },
    toCommand: (p, scene) => {
      if (!p.id) return errorCmd('add_path missing id')
      if (!Array.isArray(p.points) || p.points.length < 2) {
        return errorCmd('add_path needs at least 2 points')
      }
      if (scene.layers.some((l) => l.id === p.id)) {
        return errorCmd(`layer id "${p.id}" already exists`)
      }
      const pts = p.points.map(([x, y]) => [Number(x) || 0, Number(y) || 0] as [number, number])
      const base = p.role === 'motion' ? newMotionPathLayer() : newBezierPathLayer()
      const layer: Layer = {
        ...base,
        id: p.id,
        name: p.name ?? p.id,
        transform: { ...base.transform, x: p.x ?? base.transform.x, y: p.y ?? base.transform.y },
        path: pathFromPoints(pts, p.closed ?? false),
        ...(p.strokeColor || p.strokeWidth != null
          ? { style: { ...base.style, stroke: {
              color: p.strokeColor ?? base.style?.stroke?.color ?? '#60A5FA',
              width: p.strokeWidth ?? base.style?.stroke?.width ?? 3,
              ...base.style?.stroke,
              ...(p.strokeColor ? { color: p.strokeColor } : {}),
              ...(p.strokeWidth != null ? { width: p.strokeWidth } : {}),
            } } }
          : {}),
      }
      return makeAddLayerCmd(layer)
    },
  })

  // ── assign_motion_path ──────────────────────────────────────────────────────
  reg.register<AssignMotionPathParams>({
    id: 'path.assignMotion',
    toolName: 'assign_motion_path',
    description:
      'Make a layer travel along a path layer (followPath). Set animateMs to auto-animate ' +
      'progress 0→1 over that duration. orientToPath rotates the layer to face the path tangent.',
    parameters: {
      type: 'object',
      required: ['layerId', 'pathLayerId'],
      properties: {
        layerId:     { type: 'string', description: 'Layer that should follow the path' },
        pathLayerId: { type: 'string', description: 'Path layer to follow (type=path)' },
        orientToPath:{ type: 'boolean', description: 'Rotate to face path tangent' },
        rotationOffset:      { type: 'number', description: 'Extra rotation on top of tangent (deg)' },
        perpendicularOffset: { type: 'number', description: 'Offset perpendicular to path (px)' },
        animateMs:   { type: 'number', description: 'If set, animate progress 0→1 over this many ms' },
        timelineId:  { type: 'string', description: 'Timeline for the progress animation (default "main")' },
      },
    },
    toCommand: (p, scene) => {
      if (!p.layerId || !p.pathLayerId) return errorCmd('assign_motion_path missing layerId / pathLayerId')
      const target = scene.layers.find((l) => l.id === p.layerId)
      if (!target) return errorCmd(`layer "${p.layerId}" not found`)
      const pathLayer = scene.layers.find((l) => l.id === p.pathLayerId)
      if (!pathLayer) return errorCmd(`path layer "${p.pathLayerId}" not found`)
      if (pathLayer.type !== 'path') return errorCmd(`layer "${p.pathLayerId}" is not a path layer`)

      const followPath: FollowPath = {
        pathLayerId: p.pathLayerId,
        progress: 0,
        ...(p.orientToPath != null ? { orientToPath: p.orientToPath } : {}),
        ...(p.rotationOffset != null ? { rotationOffset: p.rotationOffset } : {}),
        ...(p.perpendicularOffset != null ? { perpendicularOffset: p.perpendicularOffset } : {}),
      }

      if (p.animateMs == null) {
        return makeUpdateLayerCmd(p.layerId, { followPath }, target)
      }

      // Animate progress 0→1: set followPath + keyframes on the progress track.
      const timelineId = p.timelineId ?? scene.timelines[0]?.id ?? 'main'
      const trackTarget = `layers.${p.layerId}.followPath.progress`
      const durationMs = Math.max(1, p.animateMs)
      const kfs: Keyframe[] = [
        { id: `kf_mp_${Date.now()}_a`, timeMs: 0, value: 0, easing: { type: 'linear' } },
        { id: `kf_mp_${Date.now()}_b`, timeMs: durationMs, value: 1, easing: { type: 'linear' } },
      ]
      const snapshot = scene
      return {
        label: `AI: assign motion path → ${p.layerId}`,
        execute: (s) => {
          let next = {
            ...s,
            layers: s.layers.map((l) => (l.id === p.layerId ? { ...l, followPath } : l)),
          }
          if (!next.timelines.some((t) => t.id === timelineId)) {
            next = {
              ...next,
              timelines: [...next.timelines, {
                id: timelineId, durationMs: Math.ceil(durationMs / 1000) * 1000,
                autoplay: true, loop: false, tracks: [], layerIds: [],
              }],
            }
          }
          if (!next.timelines.find((t) => t.id === timelineId)!.tracks.some((t) => t.target === trackTarget)) {
            next = {
              ...next,
              timelines: next.timelines.map((t) =>
                t.id !== timelineId ? t : { ...t, tracks: [...t.tracks, { target: trackTarget, keyframes: [] }] }),
            }
          }
          next = ensureLayerInTimeline(next, timelineId, p.layerId)
          for (const kf of kfs) next = upsertKeyframe(next, timelineId, trackTarget, kf)
          return next
        },
        undo: () => snapshot,
      }
    },
  })

  // ── trim_path ─────────────────────────────────────────────────────────────
  reg.register<TrimPathParams>({
    id: 'path.trim',
    toolName: 'trim_path',
    description:
      'Reveal only part of a layer\'s stroke (line-draw / progress effect). start/end/offset ' +
      'are 0–1. Animate the reveal by keyframing layers.<id>.style.stroke.trim.end.',
    parameters: {
      type: 'object',
      required: ['layerId'],
      properties: {
        layerId: { type: 'string', description: 'Layer with a stroke to trim' },
        start:   { type: 'number', description: 'Visible segment start 0–1 (default 0)' },
        end:     { type: 'number', description: 'Visible segment end 0–1 (default 1)' },
        offset:  { type: 'number', description: 'Shift the trim window 0–1 (default 0)' },
      },
    },
    toCommand: (p, scene) => {
      if (!p.layerId) return errorCmd('trim_path missing layerId')
      const target = scene.layers.find((l) => l.id === p.layerId)
      if (!target) return errorCmd(`layer "${p.layerId}" not found`)
      if (!target.style?.stroke) return errorCmd(`layer "${p.layerId}" has no stroke to trim`)
      const style = {
        ...target.style,
        stroke: {
          ...target.style.stroke,
          trim: { start: p.start ?? 0, end: p.end ?? 1, offset: p.offset ?? 0 },
        },
      }
      return makeUpdateLayerCmd(p.layerId, { style }, target)
    },
  })
}

function errorCmd(message: string) {
  return {
    label: `AI ERROR: ${message}`,
    execute: <S,>(s: S): S => s,
    undo:    <S,>(s: S): S => s,
  }
}
