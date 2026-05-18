// ── Mapping presets (BL-05) ───────────────────────────────────────────────────
// Static catalog of common expression formulas. Picked from the dropdown in
// the WireParameterModal — selecting one writes its expression into the
// editor, and any manual edit demotes the picker back to "Custom".

export type PresetCategory =
  | 'Identity' | 'Remapping' | 'Boolean' | 'Easing' | 'Trigonometric' | 'Utility'

export interface MappingPreset {
  category: PresetCategory
  label: string
  expression: string
  /** Short hint shown under the label in the picker. */
  description?: string
}

export const MAPPING_PRESETS: MappingPreset[] = [
  // ── Identity ───────────────────────────────────────────────────────────
  { category: 'Identity', label: 'Identity',  expression: 'source',
    description: 'Pass the source value through unchanged.' },

  // ── Remapping ──────────────────────────────────────────────────────────
  { category: 'Remapping', label: 'Normalized → degrees',
    expression: 'map(source, 0, 1, 0, 360)',
    description: '0–1 input becomes 0–360°.' },
  { category: 'Remapping', label: 'Percent → normalized',
    expression: 'map(source, 0, 100, 0, 1)',
    description: '0–100 input becomes 0–1.' },
  { category: 'Remapping', label: 'Normalized → ±90°',
    expression: 'map(source, 0, 1, -90, 90)',
    description: 'Recenter 0–1 around 0.' },

  // ── Boolean ────────────────────────────────────────────────────────────
  { category: 'Boolean', label: 'Boolean → scale (1 / 1.2)',
    expression: 'source ? 1.2 : 1',
    description: 'true grows 20%, false stays at 1.' },
  { category: 'Boolean', label: 'Boolean → opacity',
    expression: 'source ? 1 : 0',
    description: 'true fully visible, false hidden.' },
  { category: 'Boolean', label: 'Boolean → angle (0 / 360)',
    expression: 'source ? 360 : 0',
    description: 'Quarter-turn-like toggle for rotation.' },

  // ── Easing ─────────────────────────────────────────────────────────────
  { category: 'Easing', label: 'Smoothstep',
    expression: 'smoothstep(source)',
    description: 'Soft S-curve, slow ends, fast middle.' },
  { category: 'Easing', label: 'Smootherstep',
    expression: 'smootherstep(source)',
    description: 'Smoother S-curve (5th-order polynomial).' },
  { category: 'Easing', label: 'Quadratic in',
    expression: 'source * source',
    description: 'Slow start, fast end.' },
  { category: 'Easing', label: 'Quadratic out',
    expression: '1 - (1 - source) * (1 - source)',
    description: 'Fast start, slow end.' },

  // ── Trigonometric ──────────────────────────────────────────────────────
  { category: 'Trigonometric', label: 'Sine wave (0–1 oscillation)',
    expression: 'sin(source * 6.28) * 0.5 + 0.5',
    description: '2π-periodic, range 0–1.' },
  { category: 'Trigonometric', label: 'Sine wave (-1..1)',
    expression: 'sin(source * 6.28)',
    description: 'Bare sine, full ±1 range.' },
  { category: 'Trigonometric', label: 'Cosine wave',
    expression: 'cos(source * 6.28)',
    description: 'Cosine, full ±1 range.' },

  // ── Utility ────────────────────────────────────────────────────────────
  { category: 'Utility', label: 'Clamp 0–1',
    expression: 'clamp(source, 0, 1)',
    description: 'Saturate to the unit interval.' },
  { category: 'Utility', label: 'Invert (1 − x)',
    expression: '1 - source',
    description: 'Flip a 0–1 value.' },
  { category: 'Utility', label: 'Absolute value',
    expression: 'abs(source)',
    description: '|source|' },
  { category: 'Utility', label: 'Round to integer',
    expression: 'round(source)',
    description: 'Snap to whole numbers.' },
]

/** Find the preset whose expression matches the given text exactly (after a
 *  normalize pass that collapses whitespace). Used to highlight the active
 *  preset in the dropdown — returns null when the expression has been
 *  manually edited away from any preset. */
export function findMatchingPreset(expression: string): MappingPreset | null {
  const norm = normalize(expression)
  for (const p of MAPPING_PRESETS) {
    if (normalize(p.expression) === norm) return p
  }
  return null
}

function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/** Preset grouped by category, in declaration order. */
export function groupedPresets(): Array<{ category: PresetCategory; items: MappingPreset[] }> {
  const order: PresetCategory[] = ['Identity', 'Remapping', 'Boolean', 'Easing', 'Trigonometric', 'Utility']
  return order.map((c) => ({
    category: c,
    items: MAPPING_PRESETS.filter((p) => p.category === c),
  }))
}
