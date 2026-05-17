// ── SceneSerializer ───────────────────────────────────────────────────────────
// Converts a ChronoScene + UI state into a concise, decision-ready string
// for the LLM. Includes:
//   - composition + visible-at-time layers
//   - selected layer (highlighted with full property details)
//   - timelines with track + keyframe summaries
//   - parameters / bindings / triggers (when present)
//
// Designed for ~2-3KB of context per scene of typical complexity.

import type { ChronoScene, Layer, Timeline } from '@/lib/types'

export interface SerializeOptions {
  /** Current playhead time in ms — used for visibility filtering. Default 0. */
  currentTimeMs?: number
  /** Currently selected layer id — gets a fully detailed description. */
  selectedLayerId?: string | null
  /** Currently focused timeline id — surfaces it first. */
  selectedTimelineId?: string | null
}

// ── Layer formatting ──────────────────────────────────────────────────────────

function describeLayerTerse(layer: Layer): string {
  const t = layer.transform
  const pos = `(${Math.round(t.x)},${Math.round(t.y)})`
  const size = layer.size ? `${layer.size.width}×${layer.size.height}` : ''

  let detail = ''
  if (layer.type === 'shape') {
    const kind = layer.shapeKind ?? layer.shape ?? 'rect'
    const fill = layer.style?.fill?.color ?? layer.style?.fill?.type ?? ''
    detail = `${kind}${fill ? ` fill=${fill}` : ''}`
  } else if (layer.type === 'text') {
    const txt = layer.text?.value ? `"${layer.text.value.slice(0, 24)}"` : ''
    detail = `text=${txt} fs=${layer.text?.fontSize ?? '?'}`
  } else {
    detail = layer.type
  }
  return `  - id="${layer.id}" name="${layer.name}" ${detail} pos=${pos}${size ? ` size=${size}` : ''}${layer.opacity !== 1 ? ` op=${layer.opacity}` : ''}`
}

function describeLayerDetailed(layer: Layer): string {
  const t = layer.transform
  const lines: string[] = [
    `  ▸ id="${layer.id}" name="${layer.name}" type=${layer.type}`,
    `    transform: pos=(${t.x},${t.y}) scale=(${t.scaleX},${t.scaleY}) rotation=${t.rotationDeg}° anchor=(${t.anchorX},${t.anchorY})`,
    `    opacity: ${layer.opacity}`,
  ]
  if (layer.size) lines.push(`    size: ${layer.size.width}×${layer.size.height}px`)

  if (layer.type === 'shape') {
    const kind = layer.shapeKind ?? layer.shape ?? 'rect'
    lines.push(`    shape: kind=${kind}`)
    if (layer.style?.fill) {
      const f = layer.style.fill
      lines.push(`    fill: type=${f.type}${f.color ? ` color=${f.color}` : ''}${f.opacity != null ? ` opacity=${f.opacity}` : ''}`)
    }
    if (layer.style?.stroke) {
      const s = layer.style.stroke
      lines.push(`    stroke: color=${s.color} width=${s.width}${s.opacity != null ? ` opacity=${s.opacity}` : ''}`)
    }
    if (layer.style?.cornerRadius != null) lines.push(`    cornerRadius: ${layer.style.cornerRadius}`)
    if (layer.shapeParams) lines.push(`    shapeParams: ${JSON.stringify(layer.shapeParams)}`)
  }

  if (layer.type === 'text' && layer.text) {
    const tx = layer.text
    lines.push(`    text: value="${tx.value}" fontSize=${tx.fontSize} color=${tx.color}`)
    if (tx.fontFamily || tx.fontWeight || tx.textAlign) {
      lines.push(`         family=${tx.fontFamily ?? 'default'} weight=${tx.fontWeight ?? 'normal'} align=${tx.textAlign ?? 'left'}`)
    }
  }

  if (layer.startMs != null || layer.endMs != null) {
    lines.push(`    visible window: [${layer.startMs ?? 0}ms → ${layer.endMs ?? '∞'}ms]`)
  }
  if (layer.parentId) lines.push(`    parent: ${layer.parentId}`)
  if (layer.effects)  lines.push(`    effects: ${JSON.stringify(layer.effects)}`)

  return lines.join('\n')
}

function isLayerVisibleAt(layer: Layer, timeMs: number): boolean {
  if (layer.startMs != null && timeMs < layer.startMs) return false
  if (layer.endMs   != null && timeMs > layer.endMs)   return false
  if (layer.hidden) return false
  return true
}

// ── Timeline formatting ───────────────────────────────────────────────────────

function describeTimeline(tl: Timeline, isSelected: boolean): string {
  const flags = [
    tl.autoplay ? 'autoplay' : '',
    tl.loop ? (tl.loopCount ? `loop×${tl.loopCount}` : 'loop∞') : '',
    tl.pingPong ? 'pingPong' : '',
  ].filter(Boolean).join(' ')

  const lines: string[] = [
    `  ${isSelected ? '★' : '·'} id="${tl.id}" duration=${tl.durationMs}ms ${flags}`,
  ]
  for (const track of tl.tracks) {
    if (track.keyframes.length === 0) {
      lines.push(`    track: "${track.target}" (empty)`)
      continue
    }
    const kfPreview = track.keyframes.slice(0, 4).map((k) => {
      const v = typeof k.value === 'number'
        ? Number.isInteger(k.value) ? k.value : k.value.toFixed(2)
        : typeof k.value === 'string' ? `"${k.value}"`
        : JSON.stringify(k.value)
      return `${k.timeMs}ms=${v}`
    }).join(', ')
    const more = track.keyframes.length > 4 ? `, +${track.keyframes.length - 4} more` : ''
    lines.push(`    track: "${track.target}" → [${kfPreview}${more}]`)
  }
  return lines.join('\n')
}

// ── Main serializer ───────────────────────────────────────────────────────────

export function serializeScene(scene: ChronoScene, opts: SerializeOptions = {}): string {
  const { currentTimeMs = 0, selectedLayerId = null, selectedTimelineId = null } = opts
  const comp = scene.composition
  const lines: string[] = []

  // ── Composition ────────────────────────────────────────────────────────────
  lines.push(`CANVAS: ${comp.width}×${comp.height}px | duration=${comp.durationMs}ms | fps=${comp.frameRate} | bg=${comp.backgroundColor || '#000'}`)
  lines.push(`PLAYHEAD: ${currentTimeMs}ms`)

  // ── Layers (terse list with visibility flags) ──────────────────────────────
  lines.push(`\nLAYERS (${scene.layers.length} total):`)
  if (scene.layers.length === 0) {
    lines.push('  (empty — no layers in scene)')
  } else {
    for (const layer of scene.layers) {
      const visible = isLayerVisibleAt(layer, currentTimeMs)
      const sel = layer.id === selectedLayerId ? ' ★SELECTED' : ''
      const vis = visible ? '' : ' [hidden]'
      lines.push(`${describeLayerTerse(layer)}${sel}${vis}`)
    }
  }

  // ── Selected layer (detailed view) ─────────────────────────────────────────
  if (selectedLayerId) {
    const sel = scene.layers.find((l) => l.id === selectedLayerId)
    if (sel) {
      lines.push(`\nSELECTED LAYER DETAILS:`)
      lines.push(describeLayerDetailed(sel))
    }
  }

  // ── Timelines (selected first) ─────────────────────────────────────────────
  lines.push(`\nTIMELINES (${scene.timelines.length} total):`)
  if (scene.timelines.length === 0) {
    lines.push('  (none — create one before adding keyframes)')
  } else {
    const sorted = selectedTimelineId
      ? [
          ...scene.timelines.filter((t) => t.id === selectedTimelineId),
          ...scene.timelines.filter((t) => t.id !== selectedTimelineId),
        ]
      : scene.timelines
    for (const tl of sorted) {
      lines.push(describeTimeline(tl, tl.id === selectedTimelineId))
    }
  }

  // ── Parameters / triggers (when present, terse) ────────────────────────────
  if (scene.parameters && scene.parameters.length > 0) {
    lines.push(`\nPARAMETERS (${scene.parameters.length}):`)
    for (const p of scene.parameters) {
      lines.push(`  - id="${p.id}" name="${p.name}" type=${p.type} default=${JSON.stringify(p.defaultValue)}`)
    }
  }
  if (scene.triggers && scene.triggers.length > 0) {
    lines.push(`\nTRIGGERS (${scene.triggers.length}):`)
    for (const t of scene.triggers) {
      lines.push(`  - ${t.label ?? t.id}: event=${JSON.stringify(t.event)} → ${t.actions.length} actions`)
    }
  }

  return lines.join('\n')
}
