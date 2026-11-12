/** Canvas2D composition choices shared by source schemas and the inspector.
 * Values remain serialized Canvas operation names; the renderer owns support. */
export const BLEND_MODES: Array<[GlobalCompositeOperation, string]> = [
  ['source-over', 'Normal'],
  ['multiply',    'Multiply'],
  ['screen',      'Screen'],
  ['overlay',     'Overlay'],
  ['darken',      'Darken'],
  ['lighten',     'Lighten'],
  ['color-dodge', 'Color Dodge'],
  ['color-burn',  'Color Burn'],
  ['hard-light',  'Hard Light'],
  ['soft-light',  'Soft Light'],
  ['difference',  'Difference'],
  ['exclusion',   'Exclusion'],
  ['hue',         'Hue'],
  ['saturation',  'Saturation'],
  ['color',       'Color'],
  ['luminosity',  'Luminosity'],
]
