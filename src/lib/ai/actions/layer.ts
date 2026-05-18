// ── Layer Actions ─────────────────────────────────────────────────────────────
// add_layer / update_layer / delete_layer — all built from typed params.
// Wraps existing makeAddLayerCmd / makeUpdateLayerCmd / makeDeleteLayerCmd.

import type { Layer, LayerType, Transform } from '@/lib/types'
import type { ShapeKind } from '@/lib/types'
import type { FontWeight, TextAlign } from '@/lib/types'
import {
  makeAddLayerCmd, makeUpdateLayerCmd, makeDeleteLayerCmd,
} from '@/lib/editor/commands-layer'
import type { ActionRegistry } from '../ActionRegistry'

// ── Param types ───────────────────────────────────────────────────────────────

export interface LayerCommonParams {
  // Transform
  x?: number; y?: number; width?: number; height?: number
  opacity?: number; rotationDeg?: number
  scaleX?: number; scaleY?: number
  // Shape style
  shapeKind?: ShapeKind
  fillColor?: string; fillOpacity?: number
  strokeColor?: string; strokeWidth?: number
  cornerRadius?: number
  sides?: number; innerRadius?: number
  startAngle?: number; endAngle?: number
  // Text style
  text?: string; fontSize?: number
  fontFamily?: string; fontWeight?: string
  textColor?: string; textAlign?: TextAlign
  letterSpacing?: number
  // Visibility window
  startMs?: number; endMs?: number
  // Tree
  parentId?: string
}

export interface AddLayerParams extends LayerCommonParams {
  id: string
  name: string
  type: LayerType
}

export interface UpdateLayerParams extends LayerCommonParams {
  layerId: string
  name?: string
}

export interface DeleteLayerParams {
  layerId: string
}

// ── buildLayerFromParams ──────────────────────────────────────────────────────

/**
 * Build a fresh Layer from AddLayerParams. Defaults follow existing factory
 * conventions: anchor at layer center, opacity 1, shape fill #3B82F6, etc.
 */
export function buildLayerFromParams(p: AddLayerParams): Layer {
  const isText = p.type === 'text'
  const w = p.width  ?? (isText ? 200 : 100)
  const h = p.height ?? (isText ? (p.fontSize ?? 24) : 100)

  const transform: Transform = {
    x:           p.x ?? 0,
    y:           p.y ?? 0,
    scaleX:      p.scaleX ?? 1,
    scaleY:      p.scaleY ?? 1,
    rotationDeg: p.rotationDeg ?? 0,
    anchorX:     w / 2,
    anchorY:     h / 2,
  }

  const base = {
    id: p.id,
    name: p.name,
    type: p.type,
    transform,
    opacity: p.opacity ?? 1,
    ...(p.startMs != null ? { startMs: p.startMs } : {}),
    ...(p.endMs   != null ? { endMs:   p.endMs   } : {}),
    ...(p.parentId        ? { parentId: p.parentId } : {}),
  } satisfies Partial<Layer> as Layer

  if (p.type === 'shape') {
    const kind: ShapeKind = p.shapeKind ?? 'rect'
    return {
      ...base,
      // Legacy 'shape' field — only set for back-compat values
      ...(kind === 'rect'    ? { shape: 'rect'   as const } : {}),
      ...(kind === 'ellipse' ? {} : {}),
      shapeKind: kind,
      size: { width: w, height: h },
      style: {
        fill: {
          type: 'solid' as const,
          color:   p.fillColor   ?? '#3B82F6',
          opacity: p.fillOpacity ?? 1,
        },
        ...(p.strokeColor || p.strokeWidth != null ? {
          stroke: {
            color:     p.strokeColor ?? '#000000',
            width:     p.strokeWidth ?? 1,
            opacity:   1,
            alignment: 'center' as const,
          },
        } : {}),
        ...(p.cornerRadius != null ? { cornerRadius: p.cornerRadius } : {}),
      },
      ...(p.sides != null || p.innerRadius != null ||
          p.startAngle != null || p.endAngle != null
        ? {
            shapeParams: {
              kind,
              ...(p.sides       != null ? { sides:       p.sides       } : {}),
              ...(p.innerRadius != null ? { innerRadius: p.innerRadius } : {}),
              ...(p.startAngle  != null ? { startAngle:  p.startAngle  } : {}),
              ...(p.endAngle    != null ? { endAngle:    p.endAngle    } : {}),
            },
          }
        : {}),
    }
  }

  if (p.type === 'text') {
    return {
      ...base,
      text: {
        value:    p.text     ?? 'Text',
        fontSize: p.fontSize ?? 24,
        color:    p.textColor ?? '#FFFFFF',
        ...(p.fontFamily             ? { fontFamily: p.fontFamily } : {}),
        ...(p.fontWeight             ? { fontWeight: p.fontWeight as FontWeight } : {}),
        ...(p.textAlign              ? { textAlign:  p.textAlign  } : {}),
        ...(p.letterSpacing != null  ? { letterSpacing: p.letterSpacing } : {}),
      },
    }
  }

  // group / image / video / audio / path / pathStroke / repeater — only group
  // is plausibly created by the AI. Others require assets / pen interaction.
  return base
}

// ── applyPatchToLayer ─────────────────────────────────────────────────────────

/**
 * Merge a partial param patch into an existing layer. Only fields present in
 * the patch are touched.
 */
export function applyPatchToLayer(prev: Layer, patch: UpdateLayerParams): Layer {
  const next: Layer = { ...prev }

  // Transform (merge)
  if (
    patch.x != null || patch.y != null ||
    patch.scaleX != null || patch.scaleY != null ||
    patch.rotationDeg != null
  ) {
    next.transform = {
      ...prev.transform,
      ...(patch.x           != null ? { x:           patch.x }           : {}),
      ...(patch.y           != null ? { y:           patch.y }           : {}),
      ...(patch.scaleX      != null ? { scaleX:      patch.scaleX }      : {}),
      ...(patch.scaleY      != null ? { scaleY:      patch.scaleY }      : {}),
      ...(patch.rotationDeg != null ? { rotationDeg: patch.rotationDeg } : {}),
    }
  }

  if (patch.opacity  != null) next.opacity  = patch.opacity
  if (patch.name)             next.name     = patch.name
  if (patch.startMs  != null) next.startMs  = patch.startMs
  if (patch.endMs    != null) next.endMs    = patch.endMs

  if (patch.width != null || patch.height != null) {
    const w = patch.width  ?? prev.size?.width  ?? 100
    const h = patch.height ?? prev.size?.height ?? 100
    next.size = { width: w, height: h }
  }

  // Shape style merge
  if (
    prev.type === 'shape' && (
      patch.fillColor || patch.fillOpacity != null ||
      patch.strokeColor || patch.strokeWidth != null ||
      patch.cornerRadius != null
    )
  ) {
    next.style = {
      ...prev.style,
      ...(patch.fillColor || patch.fillOpacity != null
        ? {
            fill: {
              type: 'solid' as const,
              ...prev.style?.fill,
              ...(patch.fillColor          ? { color:   patch.fillColor   } : {}),
              ...(patch.fillOpacity != null ? { opacity: patch.fillOpacity } : {}),
            },
          }
        : {}),
      ...(patch.strokeColor || patch.strokeWidth != null
        ? {
            stroke: {
              color:     prev.style?.stroke?.color     ?? '#000000',
              width:     prev.style?.stroke?.width     ?? 1,
              alignment: prev.style?.stroke?.alignment ?? 'center' as const,
              ...prev.style?.stroke,
              ...(patch.strokeColor          ? { color: patch.strokeColor } : {}),
              ...(patch.strokeWidth != null  ? { width: patch.strokeWidth } : {}),
            },
          }
        : {}),
      ...(patch.cornerRadius != null ? { cornerRadius: patch.cornerRadius } : {}),
    }
  }

  // Text merge
  if (
    prev.type === 'text' && (
      patch.text || patch.fontSize != null ||
      patch.textColor || patch.textAlign || patch.letterSpacing != null
    )
  ) {
    next.text = {
      value:    prev.text?.value    ?? '',
      fontSize: prev.text?.fontSize ?? 24,
      color:    prev.text?.color    ?? '#FFFFFF',
      ...prev.text,
      ...(patch.text                ? { value:     patch.text          } : {}),
      ...(patch.fontSize     != null ? { fontSize:  patch.fontSize      } : {}),
      ...(patch.textColor            ? { color:     patch.textColor     } : {}),
      ...(patch.textAlign            ? { textAlign: patch.textAlign     } : {}),
      ...(patch.letterSpacing != null ? { letterSpacing: patch.letterSpacing } : {}),
    }
  }

  return next
}

// ── Action registration ──────────────────────────────────────────────────────

const LAYER_TYPE_ENUM = ['shape', 'text', 'group']
const SHAPE_KIND_ENUM = [
  'rect', 'ellipse', 'polygon', 'star', 'ring', 'arc', 'line', 'arrow', 'capsule',
  'spiral', 'wave', 'blob',   // BL-24
]
const FONT_WEIGHT_ENUM = ['normal', 'bold', '300', '400', '500', '600', '700', '800']
const TEXT_ALIGN_ENUM = ['left', 'center', 'right']

/** Param schema reused by add_layer and update_layer (shape/text/etc. fields). */
const COMMON_LAYER_PROPS = {
  x:            { type: 'number', description: 'X position in px (left edge of bounding box)' },
  y:            { type: 'number', description: 'Y position in px (top edge of bounding box)' },
  width:        { type: 'number', description: 'Width in px' },
  height:       { type: 'number', description: 'Height in px' },
  opacity:      { type: 'number', minimum: 0, maximum: 1, description: 'Opacity 0-1' },
  rotationDeg:  { type: 'number', description: 'Rotation in degrees' },
  scaleX:       { type: 'number', description: 'Horizontal scale (1 = 100%)' },
  scaleY:       { type: 'number', description: 'Vertical scale (1 = 100%)' },
  shapeKind:    { type: 'string', enum: SHAPE_KIND_ENUM, description: 'Shape geometry kind' },
  fillColor:    { type: 'string', description: 'Fill hex color e.g. "#3B82F6"' },
  fillOpacity:  { type: 'number', minimum: 0, maximum: 1 },
  strokeColor:  { type: 'string' },
  strokeWidth:  { type: 'number' },
  cornerRadius: { type: 'number' },
  sides:        { type: 'number', description: 'Edge count for polygon/star (3-12) or blob (5-64)' },
  innerRadius:  { type: 'number', description: 'Inner radius for star/ring' },
  startAngle:   { type: 'number', description: 'Start angle for arc/ring in degrees' },
  endAngle:     { type: 'number', description: 'End angle for arc/ring in degrees' },
  // ── BL-24: Spiral / Wave / Blob ──────────────────────────────────────────
  turns:        { type: 'number', description: 'Spiral turn count (0.5–20)' },
  startRadius:  { type: 'number', description: 'Spiral inner starting radius in px' },
  endRadius:    { type: 'number', description: 'Spiral outer ending radius in px' },
  tightness:    { type: 'number', description: 'Spiral radius interpolation exponent (1=linear)' },
  amplitude:    { type: 'number', description: 'Wave peak height in px' },
  frequency:    { type: 'number', description: 'Wave full-cycle count across width (0.1–50)' },
  phase:        { type: 'number', description: 'Wave phase offset in radians' },
  irregularity: { type: 'number', minimum: 0, maximum: 1, description: 'Blob noise ratio 0–1' },
  seed:         { type: 'number', description: 'Blob deterministic seed integer' },
  text:         { type: 'string', description: 'Text content (required when type=text)' },
  fontSize:     { type: 'number' },
  fontFamily:   { type: 'string' },
  fontWeight:   { type: 'string', enum: FONT_WEIGHT_ENUM },
  textColor:    { type: 'string' },
  textAlign:    { type: 'string', enum: TEXT_ALIGN_ENUM },
  letterSpacing:{ type: 'number' },
  startMs:      { type: 'number', description: 'Time (ms) when layer becomes visible' },
  endMs:        { type: 'number', description: 'Time (ms) when layer disappears' },
  parentId:     { type: 'string', description: 'Parent group layer id' },
} as const

export function registerLayerActions(reg: ActionRegistry): void {
  // ── add_layer ─────────────────────────────────────────────────────────────
  reg.register<AddLayerParams>({
    id: 'layer.add',
    toolName: 'add_layer',
    description:
      'Add a new layer to the scene. Set a meaningful id (e.g. "bg_rect", ' +
      '"title_text") — you will use this id in add_keyframes track targets.',
    parameters: {
      type: 'object',
      required: ['id', 'name', 'type'],
      properties: {
        id:   { type: 'string', description: 'Unique layer id used to reference in keyframes' },
        name: { type: 'string', description: 'Display name shown in the layer panel' },
        type: { type: 'string', enum: LAYER_TYPE_ENUM, description: 'Layer type' },
        ...COMMON_LAYER_PROPS,
      },
    },
    toCommand: (p, scene) => {
      if (!p.id || !p.name || !p.type) {
        return errorCmd(`add_layer missing required field (id="${p.id}" name="${p.name}" type="${p.type}")`)
      }
      if (scene.layers.some((l) => l.id === p.id)) {
        return errorCmd(`layer id "${p.id}" already exists — choose a different id`)
      }
      const layer = buildLayerFromParams(p)
      return makeAddLayerCmd(layer)
    },
  })

  // ── update_layer ──────────────────────────────────────────────────────────
  reg.register<UpdateLayerParams>({
    id: 'layer.update',
    toolName: 'update_layer',
    description: 'Update properties of an existing layer. Only provide fields you want to change.',
    parameters: {
      type: 'object',
      required: ['layerId'],
      properties: {
        layerId: { type: 'string', description: 'ID of the layer to update' },
        name:    { type: 'string' },
        ...COMMON_LAYER_PROPS,
      },
    },
    toCommand: (p, scene) => {
      if (!p.layerId) return errorCmd('update_layer missing layerId')
      const prev = scene.layers.find((l) => l.id === p.layerId)
      if (!prev) return errorCmd(`layer "${p.layerId}" not found`)
      const next = applyPatchToLayer(prev, p)
      return makeUpdateLayerCmd(p.layerId, next, prev)
    },
  })

  // ── delete_layer ──────────────────────────────────────────────────────────
  reg.register<DeleteLayerParams>({
    id: 'layer.delete',
    toolName: 'delete_layer',
    description: 'Remove a layer from the scene.',
    parameters: {
      type: 'object',
      required: ['layerId'],
      properties: {
        layerId: { type: 'string', description: 'ID of the layer to delete' },
      },
    },
    toCommand: (p, scene) => {
      if (!p.layerId) return errorCmd('delete_layer missing layerId')
      const layer = scene.layers.find((l) => l.id === p.layerId)
      if (!layer) return errorCmd(`layer "${p.layerId}" not found`)
      return makeDeleteLayerCmd(layer)
    },
  })
}

// ── Error helper ──────────────────────────────────────────────────────────────

function errorCmd(message: string) {
  return {
    label: `AI ERROR: ${message}`,
    execute: <S,>(s: S): S => s,
    undo:    <S,>(s: S): S => s,
  }
}
