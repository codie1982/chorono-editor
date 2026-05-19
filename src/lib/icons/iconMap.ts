/**
 * Chorono Icon Sprite Map
 *
 * Sprite sheet grid: 10 columns × N rows, each cell is 30×30 px.
 * Light theme: /assets/icons/chorono-icons-light.png
 * Dark  theme: /assets/icons/chorono-icons-dark.png
 *
 * Both files share the exact same grid layout.
 * Position formula:  x = col * 30,  y = row * 30
 * CSS usage:  background-position: -Xpx -Ypx
 */

export const CELL_SIZE = 30

export interface IconPosition {
  row: number
  col: number
}

/** Full icon registry keyed by semantic name */
export const ICON_MAP: Record<string, IconPosition> = {
  // ── Row 0 — Basic Shapes ──────────────────────────────────────────────────
  rectangle:        { row: 0, col: 0 },
  roundedRectangle: { row: 0, col: 1 },
  circle:           { row: 0, col: 2 },
  ellipse:          { row: 0, col: 3 },
  line:             { row: 0, col: 4 },
  arrow:            { row: 0, col: 5 },
  triangle:         { row: 0, col: 6 },
  polygon:          { row: 0, col: 7 },
  star:             { row: 0, col: 8 },
  ring:             { row: 0, col: 9 },

  // ── Row 1 — Path & Vector ─────────────────────────────────────────────────
  arc:          { row: 1, col: 0 },
  pie:          { row: 1, col: 1 },
  capsule:      { row: 1, col: 2 },
  blob:         { row: 1, col: 3 },
  bezierPath:   { row: 1, col: 4 },
  freehandPath: { row: 1, col: 5 },
  svgImport:    { row: 1, col: 6 },
  compoundPath: { row: 1, col: 7 },
  motionPath:   { row: 1, col: 8 },
  maskPath:     { row: 1, col: 9 },

  // ── Row 2 — Text & Media ──────────────────────────────────────────────────
  text:          { row: 2, col: 0 },
  textBox:       { row: 2, col: 1 },
  textPath:      { row: 2, col: 2 },
  counterText:   { row: 2, col: 3 },
  dynamicText:   { row: 2, col: 4 },
  image:         { row: 2, col: 5 },
  video:         { row: 2, col: 6 },
  audio:         { row: 2, col: 7 },
  imageSequence: { row: 2, col: 8 },
  gif:           { row: 2, col: 9 },

  // ── Row 3 — Effects ───────────────────────────────────────────────────────
  spriteSheet: { row: 3, col: 0 },
  glow:        { row: 3, col: 1 },
  blur:        { row: 3, col: 2 },
  shadow:      { row: 3, col: 3 },
  gradient:    { row: 3, col: 4 },
  lightSweep:  { row: 3, col: 5 },
  trail:       { row: 3, col: 6 },
  noise:       { row: 3, col: 7 },
  adjustment:  { row: 3, col: 8 },
  group:       { row: 3, col: 9 },

  // ── Row 4 — Masks & Controls ──────────────────────────────────────────────
  rectMask:       { row: 4, col: 0 },
  ellipseMask:    { row: 4, col: 1 },
  pathMask:       { row: 4, col: 2 },
  alphaMask:      { row: 4, col: 3 },
  lumaMask:       { row: 4, col: 4 },
  nullObject:     { row: 4, col: 5 },
  sliderControl:  { row: 4, col: 6 },
  colorControl:   { row: 4, col: 7 },
  pointControl:   { row: 4, col: 8 },
  checkboxControl:{ row: 4, col: 9 },

  // ── Row 5 — Groups & Interaction ──────────────────────────────────────────
  stateControl:     { row: 5, col: 0 },
  precompose:       { row: 5, col: 1 },
  component:        { row: 5, col: 2 },
  symbol:           { row: 5, col: 3 },
  repeater:         { row: 5, col: 4 },
  hitArea:          { row: 5, col: 5 },
  gestureArea:      { row: 5, col: 6 },
  dropZone:         { row: 5, col: 7 },
  triggerZone:      { row: 5, col: 8 },
  scrollController: { row: 5, col: 9 },

  // ── Row 6 — Extended (dark sprite only) ───────────────────────────────────
  folder:        { row: 6, col: 0 },
  stackedLayers: { row: 6, col: 1 },
  box3d:         { row: 6, col: 2 },
  hexagon:       { row: 6, col: 3 },
  loadingDots:   { row: 6, col: 4 },
  cursorBox:     { row: 6, col: 5 },
  touchBox:      { row: 6, col: 6 },
  downloadBox:   { row: 6, col: 7 },
  lightningBox:  { row: 6, col: 8 },
  scrollMouse:   { row: 6, col: 9 },

  // ── BL-24 placeholders ────────────────────────────────────────────────────
  // Sprite sheet has no spiral/wave cells yet. Reuse visually similar icons
  // until proper sprite cells are designed (separate art task).
  spiral:        { row: 1, col: 0 },  // borrows 'arc' (curved shape)
  wave:          { row: 0, col: 4 },  // borrows 'line' (horizontal stroke)
}

/** Resolve a position to CSS background-position value */
export function iconToBgPos({ row, col }: IconPosition): string {
  const x = col * CELL_SIZE
  const y = row * CELL_SIZE
  return `${x === 0 ? '0' : `-${x}px`} ${y === 0 ? '0' : `-${y}px`}`
}

/**
 * Layer-type → icon name mapping.
 * Used in the layer list to show the right icon for each layer.
 */
export const LAYER_TYPE_ICON: Record<string, string> = {
  // shape kinds
  rect:             'rectangle',
  circle:           'circle',
  ellipse:          'ellipse',
  line:             'line',
  arrow:            'arrow',
  triangle:         'triangle',
  polygon:          'polygon',
  star:             'star',
  ring:             'ring',
  arc:              'arc',
  pie:              'pie',
  capsule:          'capsule',
  blob:             'blob',
  spiral:           'spiral',   // BL-24
  wave:             'wave',     // BL-24
  // layer types
  particleEmitter: 'noise',  // BL-13: row 3, col 7 (existing sprite)
  text:             'text',
  image:            'image',
  video:            'video',
  audio:            'audio',
  pathStroke:       'motionPath',
  path:             'bezierPath',
  svg:              'svgImport',
  group:            'group',
  mask:             'rectMask',
  effect:           'adjustment',
  control:          'sliderControl',
  interaction:      'hitArea',
}

/**
 * Add-layer menu definition — categories with their items.
 * Extend this list as new layer types are implemented.
 */
export interface AddLayerItem {
  label: string
  type: string   // matches ShapeKind / LayerType used in addLayer()
  icon: string   // key in ICON_MAP
  available: boolean  // false = coming soon (grayed out)
}

export interface AddLayerGroup {
  title: string
  items: AddLayerItem[]
}

export const ADD_LAYER_GROUPS: AddLayerGroup[] = [
  {
    title: 'Basic Shapes',
    items: [
      { label: 'Rectangle',        type: 'rect',             icon: 'rectangle',        available: true  },
      { label: 'Rounded Rect',     type: 'roundedRect',      icon: 'roundedRectangle', available: true  },
      { label: 'Circle',           type: 'circle',           icon: 'circle',           available: true  },
      { label: 'Ellipse',          type: 'ellipse',          icon: 'ellipse',          available: true  },
      { label: 'Line',             type: 'line',             icon: 'line',             available: true  },
      { label: 'Arrow',            type: 'arrow',            icon: 'arrow',            available: true  },
      { label: 'Triangle',         type: 'triangle',         icon: 'triangle',         available: false },
      { label: 'Polygon',          type: 'polygon',          icon: 'polygon',          available: true  },
      { label: 'Star',             type: 'star',             icon: 'star',             available: true  },
      { label: 'Ring',             type: 'ring',             icon: 'ring',             available: true  },
      { label: 'Arc',              type: 'arc',              icon: 'arc',              available: true  },
      { label: 'Pie',              type: 'pie',              icon: 'pie',              available: false },
      { label: 'Capsule',          type: 'capsule',          icon: 'capsule',          available: true  },
      { label: 'Blob',             type: 'blob',             icon: 'blob',             available: true  }, // BL-24
      { label: 'Spiral',           type: 'spiral',           icon: 'spiral',           available: true  }, // BL-24
      { label: 'Wave',             type: 'wave',             icon: 'wave',             available: true  }, // BL-24
    ],
  },
  {
    title: 'Path & Vector',
    items: [
      { label: 'Path Stroke',  type: 'pathStroke',   icon: 'motionPath',   available: true  },
      { label: 'Bezier Path',  type: 'bezierPath',   icon: 'bezierPath',   available: true  },
      { label: 'Freehand',     type: 'freehandPath', icon: 'freehandPath', available: false },
      { label: 'SVG Import',   type: 'svgImport',    icon: 'svgImport',    available: true  },
      { label: 'Motion Path',  type: 'motionPath',   icon: 'motionPath',   available: false },
    ],
  },
  {
    title: 'Text',
    items: [
      { label: 'Text',         type: 'text',         icon: 'text',         available: true  },
      { label: 'Text Box',     type: 'textBox',      icon: 'textBox',      available: false },
      { label: 'Text on Path', type: 'textPath',     icon: 'textPath',     available: false },
      { label: 'Counter',      type: 'counterText',  icon: 'counterText',  available: false },
    ],
  },
  {
    title: 'Media',
    items: [
      { label: 'Image',    type: 'image', icon: 'image', available: true },
      { label: 'Video',    type: 'video', icon: 'video', available: true },
      { label: 'Audio',    type: 'audio', icon: 'audio', available: true },
      { label: 'GIF',      type: 'gif',   icon: 'gif',   available: false },
    ],
  },
  {
    title: 'Particles',
    items: [
      { label: 'Particle Emitter', type: 'particleEmitter', icon: 'noise', available: true },
    ],
  },
  {
    title: 'Effects',
    items: [
      { label: 'Glow',        type: 'glow',       icon: 'glow',       available: false },
      { label: 'Blur',        type: 'blur',        icon: 'blur',        available: false },
      { label: 'Shadow',      type: 'shadow',      icon: 'shadow',      available: false },
      { label: 'Light Sweep', type: 'lightSweep',  icon: 'lightSweep',  available: false },
      { label: 'Gradient',    type: 'gradient',    icon: 'gradient',    available: false },
      { label: 'Trail',       type: 'trail',       icon: 'trail',       available: false },
      { label: 'Noise',       type: 'noise',       icon: 'noise',       available: false },
      { label: 'Adjustment',  type: 'adjustment',  icon: 'adjustment',  available: false },
    ],
  },
  {
    title: 'Groups',
    items: [
      { label: 'Group',      type: 'group',      icon: 'group',      available: true  },
      { label: 'Pre-compose',type: 'precompose',  icon: 'precompose', available: false },
      { label: 'Component',  type: 'component',  icon: 'component',  available: false },
      { label: 'Repeater',   type: 'repeater',   icon: 'repeater',   available: true  },
    ],
  },
  {
    title: 'Masks',
    items: [
      { label: 'Rect Mask',    type: 'rectMask',    icon: 'rectMask',    available: false },
      { label: 'Ellipse Mask', type: 'ellipseMask', icon: 'ellipseMask', available: false },
      { label: 'Path Mask',    type: 'pathMask',    icon: 'pathMask',    available: false },
    ],
  },
  {
    title: 'Interaction',
    items: [
      { label: 'Hit Area',    type: 'hitArea',    icon: 'hitArea',    available: false },
      { label: 'Gesture',     type: 'gesture',    icon: 'gestureArea',available: false },
      { label: 'Drop Zone',   type: 'dropZone',   icon: 'dropZone',   available: false },
      { label: 'Trigger',     type: 'triggerZone',icon: 'triggerZone',available: false },
    ],
  },
]
