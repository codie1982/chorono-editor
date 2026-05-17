// ── AI Tool Definitions + System Prompt ──────────────────────────────────────
// Tools are provider-agnostic (AITool[]) and translated per-provider in providers.ts

import type { AITool } from './types'

export const ANIMATION_TOOLS: AITool[] = [
  // ── Scene management ────────────────────────────────────────────────────────
  {
    name: 'clear_scene',
    description:
      'Remove all layers and timelines from the scene (fresh start). Use before generating a complete new animation from scratch.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },

  {
    name: 'update_composition',
    description: 'Change canvas composition settings (size, duration, framerate, background color).',
    parameters: {
      type: 'object',
      properties: {
        width:           { type: 'number', description: 'Canvas width in px' },
        height:          { type: 'number', description: 'Canvas height in px' },
        durationMs:      { type: 'number', description: 'Total duration in milliseconds' },
        frameRate:       { type: 'number', description: 'Frames per second (24, 30, 60)' },
        backgroundColor: { type: 'string', description: 'CSS hex color e.g. "#1a1a2e"' },
      },
    },
  },

  // ── Layer operations ────────────────────────────────────────────────────────
  {
    name: 'add_layer',
    description:
      'Add a new layer to the scene. For shape layers set shapeKind. For text layers set text and fontSize. ' +
      'IMPORTANT: Set a meaningful id (e.g. "bg_rect", "title_text") — you will use this id in add_keyframes.',
    parameters: {
      type: 'object',
      required: ['id', 'name', 'type'],
      properties: {
        id:           { type: 'string', description: 'Unique layer id used to reference in keyframes e.g. "bg_circle"' },
        name:         { type: 'string', description: 'Display name shown in the layer panel' },
        type:         { type: 'string', enum: ['shape', 'text', 'group'], description: 'Layer type' },
        // Transform
        x:            { type: 'number', description: 'X position in px (left edge of bounding box)' },
        y:            { type: 'number', description: 'Y position in px (top edge of bounding box)' },
        width:        { type: 'number', description: 'Width in px' },
        height:       { type: 'number', description: 'Height in px' },
        opacity:      { type: 'number', minimum: 0, maximum: 1, description: 'Initial opacity 0-1' },
        rotationDeg:  { type: 'number', description: 'Initial rotation in degrees' },
        scaleX:       { type: 'number', description: 'Horizontal scale (1 = 100%)' },
        scaleY:       { type: 'number', description: 'Vertical scale (1 = 100%)' },
        // Shape-specific
        shapeKind: {
          type: 'string',
          enum: ['rect', 'ellipse', 'polygon', 'star', 'ring', 'arc', 'line', 'arrow', 'capsule'],
          description: 'Shape geometry. Required when type=shape',
        },
        fillColor:    { type: 'string', description: 'Fill hex color e.g. "#3B82F6"' },
        fillOpacity:  { type: 'number', minimum: 0, maximum: 1, description: 'Fill opacity' },
        strokeColor:  { type: 'string', description: 'Stroke hex color' },
        strokeWidth:  { type: 'number', description: 'Stroke width in px' },
        cornerRadius: { type: 'number', description: 'Corner radius in px (rect/capsule)' },
        sides:        { type: 'number', description: 'Edge count for polygon/star (3-12)' },
        innerRadius:  { type: 'number', description: 'Inner radius for star/ring in px' },
        startAngle:   { type: 'number', description: 'Start angle for arc/ring in degrees (0 = 12 o\'clock)' },
        endAngle:     { type: 'number', description: 'End angle for arc/ring in degrees' },
        // Text-specific
        text:         { type: 'string', description: 'Text content. Required when type=text' },
        fontSize:     { type: 'number', description: 'Font size in px' },
        fontFamily:   { type: 'string', description: 'Font family e.g. "Inter", "Georgia"' },
        fontWeight:   { type: 'string', enum: ['normal', 'bold', '300', '400', '500', '600', '700', '800'], description: 'Font weight' },
        textColor:    { type: 'string', description: 'Text fill color hex' },
        textAlign:    { type: 'string', enum: ['left', 'center', 'right'] },
        letterSpacing:{ type: 'number', description: 'Letter spacing in px' },
        // Visibility range
        startMs:      { type: 'number', description: 'Time (ms) when layer becomes visible. Default 0' },
        endMs:        { type: 'number', description: 'Time (ms) when layer disappears. Default = timeline duration' },
        // Group
        parentId:     { type: 'string', description: 'Parent group layer id (for nested layers)' },
      },
    },
  },

  {
    name: 'update_layer',
    description: 'Update properties of an existing layer. Only provide the fields you want to change.',
    parameters: {
      type: 'object',
      required: ['layerId'],
      properties: {
        layerId:      { type: 'string', description: 'ID of the layer to update' },
        name:         { type: 'string' },
        x:            { type: 'number' },
        y:            { type: 'number' },
        width:        { type: 'number' },
        height:       { type: 'number' },
        opacity:      { type: 'number', minimum: 0, maximum: 1 },
        rotationDeg:  { type: 'number' },
        fillColor:    { type: 'string' },
        fillOpacity:  { type: 'number' },
        strokeColor:  { type: 'string' },
        strokeWidth:  { type: 'number' },
        cornerRadius: { type: 'number' },
        text:         { type: 'string' },
        fontSize:     { type: 'number' },
        textColor:    { type: 'string' },
        textAlign:    { type: 'string', enum: ['left', 'center', 'right'] },
        startMs:      { type: 'number' },
        endMs:        { type: 'number' },
      },
    },
  },

  {
    name: 'delete_layer',
    description: 'Remove a layer from the scene.',
    parameters: {
      type: 'object',
      required: ['layerId'],
      properties: {
        layerId: { type: 'string', description: 'ID of the layer to delete' },
      },
    },
  },

  // ── Timeline operations ─────────────────────────────────────────────────────
  {
    name: 'create_timeline',
    description:
      'Create an animation timeline. You MUST create a timeline before calling add_keyframes. ' +
      'Set a meaningful id (e.g. "intro", "loop_anim") — you will use this in add_keyframes.',
    parameters: {
      type: 'object',
      required: ['id', 'durationMs'],
      properties: {
        id:         { type: 'string', description: 'Unique timeline id e.g. "intro_anim"' },
        durationMs: { type: 'number', description: 'Total timeline duration in milliseconds' },
        autoplay:   { type: 'boolean', description: 'Start playing automatically on load' },
        loop:       { type: 'boolean', description: 'Loop the timeline indefinitely' },
        loopCount:  { type: 'number', description: 'Number of loops (0 = infinite). Only when loop=true' },
        pingPong:   { type: 'boolean', description: 'Play forward then backward' },
      },
    },
  },

  // ── Keyframe operations ─────────────────────────────────────────────────────
  {
    name: 'add_keyframes',
    description: `Add keyframes to animate a layer property. Creates a track automatically if it doesn't exist.

TRACK TARGET FORMAT: "layers.{layerId}.{property}"

AVAILABLE PROPERTIES:
  opacity                → 0.0 – 1.0
  transform.x            → pixels (horizontal position)
  transform.y            → pixels (vertical position)
  transform.scaleX       → 1.0 = 100%
  transform.scaleY       → 1.0 = 100%
  transform.rotationDeg  → degrees
  style.fill.color       → "#rrggbb" hex string
  style.fill.opacity     → 0.0 – 1.0
  style.stroke.width     → pixels
  style.cornerRadius     → pixels
  text.fontSize          → pixels
  text.letterSpacing     → pixels
  effects.blur           → 0 – 100

EXAMPLES:
  target: "layers.bg_circle.opacity"
  target: "layers.title_text.transform.y"
  target: "layers.logo.transform.scaleX"`,
    parameters: {
      type: 'object',
      required: ['timelineId', 'target', 'keyframes'],
      properties: {
        timelineId: { type: 'string', description: 'ID of the timeline to add keyframes to' },
        target:     { type: 'string', description: 'Track target path e.g. "layers.bg_circle.opacity"' },
        keyframes: {
          type: 'array',
          description: 'Array of keyframes. Minimum 2 keyframes for animation.',
          items: {
            type: 'object',
            properties: {
              timeMs: { type: 'number', description: 'Time in milliseconds' },
              value:  { description: 'Value at this time. Number for most props, "#rrggbb" for colors' },
              easing: {
                type: 'string',
                enum: ['linear', 'easeIn', 'easeOut', 'easeInOut', 'hold'],
                description: 'Easing curve from this keyframe to the next. Default: easeInOut',
              },
            },
            required: ['timeMs', 'value'],
          },
        },
      },
    },
  },
]

// ── System Prompt ─────────────────────────────────────────────────────────────

export function buildSystemPrompt(sceneContext: string): string {
  return `You are an AI animation assistant for Chorono, a professional keyframe animation editor.

Your role is to help users create and modify animations by calling tools. You have full control over the scene.

## COORDINATE SYSTEM
- Canvas origin is top-left corner
- X increases rightward, Y increases downward
- Default canvas: 360×640px (mobile portrait)

## WORKFLOW FOR CREATING A NEW ANIMATION
1. Call clear_scene (if starting fresh)
2. Call update_composition (if custom size/duration needed)
3. Call create_timeline (define id, durationMs, autoplay, loop)
4. Call add_layer for each visual element (shapes + text) — use meaningful IDs!
5. Call add_keyframes for each animated property

## IMPORTANT RULES
- Always create a timeline BEFORE adding keyframes
- Layer ids you choose in add_layer MUST match what you use in add_keyframes target
- For smooth animations use "easeInOut" easing; for snappy use "easeOut" on entry
- Stagger layered animations: offset each layer's keyframe start by 100-200ms
- Colors are always hex strings: "#3B82F6" not "blue"
- Position (x, y) is the TOP-LEFT of the layer bounding box
- For centered elements: x = (canvasW - layerW) / 2, y = (canvasH - layerH) / 2

## CURRENT SCENE STATE
${sceneContext}

Call tools to fulfill the user's request. Briefly explain what you're creating before calling tools.`
}
