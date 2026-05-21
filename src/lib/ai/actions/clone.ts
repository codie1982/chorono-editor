// ── Clone & Array Actions (BL-59 AI surface) ──────────────────────────────────
// Wraps makeCloneCmd / makeArrayCmd. The AI picks a source layer and either
// duplicates it (copy / live instance) or lays out N copies in a
// linear / grid / radial / path pattern.

import { buildArraySettings } from '@/lib/array/buildArraySettings'
import type { CloneMode } from '@/lib/clone/CloneTypes'
import { makeCloneCmd, makeArrayCmd } from '@/lib/editor/commands-clone'
import type { ActionRegistry } from '../ActionRegistry'

const CLONE_MODE_ENUM: CloneMode[] = ['copy', 'instance']
const ARRAY_PATTERN_ENUM = ['linear', 'grid', 'radial', 'path']

interface CloneLayerParams {
  layerId: string
  count?: number
  offsetX?: number
  offsetY?: number
  mode?: CloneMode
}

interface ArrayLayerParams {
  layerId: string
  pattern: 'linear' | 'grid' | 'radial' | 'path'
  cloneMode?: CloneMode
  count?: number
  // linear
  moveX?: number; moveY?: number; rotationDeg?: number; scaleX?: number; scaleY?: number
  // grid
  columns?: number; rows?: number
  columnMoveX?: number; columnMoveY?: number; rowMoveX?: number; rowMoveY?: number
  // radial
  centerX?: number; centerY?: number; radius?: number
  startAngleDeg?: number; totalAngleDeg?: number; closed?: boolean; orientToAngle?: boolean
  // path
  pathLayerId?: string; startOffset?: number; endOffset?: number
  alignToTangent?: boolean; reverse?: boolean
}

export function registerCloneActions(reg: ActionRegistry): void {
  // ── clone_layer ─────────────────────────────────────────────────────────────
  reg.register<CloneLayerParams>({
    id: 'clone.layer',
    toolName: 'clone_layer',
    description:
      'Duplicate a layer. mode="copy" makes independent copies; mode="instance" makes ' +
      'live instances that mirror the source visual (editing the source updates them). ' +
      'count = number of NEW copies, each offset by (offsetX, offsetY) from the last.',
    parameters: {
      type: 'object',
      required: ['layerId'],
      properties: {
        layerId: { type: 'string', description: 'Source layer id to clone' },
        count:   { type: 'number', description: 'Number of new copies (default 1)' },
        offsetX: { type: 'number', description: 'Per-copy x offset in px (default 20)' },
        offsetY: { type: 'number', description: 'Per-copy y offset in px (default 20)' },
        mode:    { type: 'string', enum: CLONE_MODE_ENUM, description: 'copy or instance (default copy)' },
      },
    },
    toCommand: (p, scene) => {
      if (!p.layerId) return errorCmd('clone_layer missing layerId')
      const source = scene.layers.find((l) => l.id === p.layerId)
      if (!source) return errorCmd(`layer "${p.layerId}" not found`)
      return makeCloneCmd({
        source,
        count: p.count ?? 1,
        ...(p.offsetX != null ? { offsetX: p.offsetX } : {}),
        ...(p.offsetY != null ? { offsetY: p.offsetY } : {}),
        ...(p.mode ? { mode: p.mode } : {}),
        timeline: scene.timelines[0] ?? null,
        allLayers: scene.layers,
      })
    },
  })

  // ── array_layer ─────────────────────────────────────────────────────────────
  reg.register<ArrayLayerParams>({
    id: 'clone.array',
    toolName: 'array_layer',
    description:
      'Lay out copies of a layer in a pattern: "linear" (row/column via moveX/moveY), ' +
      '"grid" (columns×rows), "radial" (count around a circle: radius + angles), or "path" ' +
      '(distribute along a path layer). count includes the source. cloneMode copy|instance.',
    parameters: {
      type: 'object',
      required: ['layerId', 'pattern'],
      properties: {
        layerId:   { type: 'string', description: 'Source layer id' },
        pattern:   { type: 'string', enum: ARRAY_PATTERN_ENUM, description: 'Array layout' },
        cloneMode: { type: 'string', enum: CLONE_MODE_ENUM, description: 'copy or instance' },
        count:     { type: 'number', description: 'Total objects incl. source (linear/radial/path)' },
        moveX:     { type: 'number', description: 'Linear: x step per copy' },
        moveY:     { type: 'number', description: 'Linear: y step per copy' },
        rotationDeg: { type: 'number', description: 'Linear: rotation step per copy (deg)' },
        scaleX:    { type: 'number', description: 'Linear: scaleX step (multiplicative)' },
        scaleY:    { type: 'number', description: 'Linear: scaleY step' },
        columns:   { type: 'number', description: 'Grid: column count' },
        rows:      { type: 'number', description: 'Grid: row count' },
        columnMoveX: { type: 'number', description: 'Grid: x step between columns' },
        columnMoveY: { type: 'number', description: 'Grid: y step between columns' },
        rowMoveX:  { type: 'number', description: 'Grid: x step between rows' },
        rowMoveY:  { type: 'number', description: 'Grid: y step between rows' },
        centerX:   { type: 'number', description: 'Radial: center x' },
        centerY:   { type: 'number', description: 'Radial: center y' },
        radius:    { type: 'number', description: 'Radial: ring radius' },
        startAngleDeg: { type: 'number', description: 'Radial: start angle (deg)' },
        totalAngleDeg: { type: 'number', description: 'Radial: total arc span (deg)' },
        closed:    { type: 'boolean', description: 'Radial: distribute evenly around full circle' },
        orientToAngle: { type: 'boolean', description: 'Radial: rotate each to face outward' },
        pathLayerId: { type: 'string', description: 'Path: id of the path layer to follow' },
        startOffset: { type: 'number', description: 'Path: skip arc-length at start' },
        endOffset:   { type: 'number', description: 'Path: skip arc-length at end' },
        alignToTangent: { type: 'boolean', description: 'Path: rotate to path tangent' },
        reverse:   { type: 'boolean', description: 'Path: distribute in reverse' },
      },
    },
    toCommand: (p, scene) => {
      if (!p.layerId || !p.pattern) return errorCmd('array_layer missing layerId / pattern')
      const source = scene.layers.find((l) => l.id === p.layerId)
      if (!source) return errorCmd(`layer "${p.layerId}" not found`)
      if (p.pattern === 'path') {
        if (!p.pathLayerId) return errorCmd('array_layer pattern=path requires pathLayerId')
        if (!scene.layers.some((l) => l.id === p.pathLayerId)) {
          return errorCmd(`path layer "${p.pathLayerId}" not found`)
        }
      }
      const settings = buildArraySettings(p)
      return makeArrayCmd({
        source, settings,
        timeline: scene.timelines[0] ?? null,
        allLayers: scene.layers,
      })
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
