// ── SceneSerializer ───────────────────────────────────────────────────────────
// Converts a ChronoScene to a concise, readable string for the LLM context.
// Keeps token count low while giving the model what it needs to make decisions.

import type { ChronoScene, Layer } from '@/lib/types'

function describeLayer(layer: Layer): string {
  const t = layer.transform
  const pos = `(${Math.round(t.x)}, ${Math.round(t.y)})`
  const size = layer.size ? `${layer.size.width}×${layer.size.height}px` : ''

  let detail = ''

  if (layer.type === 'shape') {
    const kind = layer.shapeKind ?? layer.shape ?? 'rect'
    const fill = layer.style?.fill?.color ?? layer.style?.fill?.type ?? ''
    detail = `shape=${kind}${fill ? ` fill=${fill}` : ''}${size ? ` size=${size}` : ''}`
    if (layer.style?.cornerRadius) detail += ` r=${layer.style.cornerRadius}`
    if (layer.style?.stroke?.width) detail += ` stroke=${layer.style.stroke.width}px`
  } else if (layer.type === 'text') {
    const txt = layer.text?.value ? `"${layer.text.value.slice(0, 30)}"` : ''
    const fs = layer.text?.fontSize ?? ''
    detail = `text=${txt} fontSize=${fs}px`
    if (layer.text?.color) detail += ` color=${layer.text.color}`
  } else if (layer.type === 'group') {
    detail = `group`
  } else if (layer.type === 'image') {
    detail = `image${size ? ` size=${size}` : ''}`
  } else if (layer.type === 'video') {
    detail = `video${size ? ` size=${size}` : ''}`
  } else {
    detail = layer.type
  }

  const opacity = layer.opacity !== 1 ? ` opacity=${layer.opacity}` : ''
  const rotation = t.rotationDeg ? ` rot=${Math.round(t.rotationDeg)}°` : ''
  const scale = (t.scaleX !== 1 || t.scaleY !== 1) ? ` scale=${t.scaleX},${t.scaleY}` : ''
  const parent = layer.parentId ? ` parent=${layer.parentId}` : ''
  const visibility = (layer.startMs != null || layer.endMs != null)
    ? ` visible=[${layer.startMs ?? 0}ms–${layer.endMs ?? '∞'}ms]`
    : ''

  return `  • id="${layer.id}" name="${layer.name}" type=${layer.type} ${detail} pos=${pos}${size ? ` size=${size}` : ''}${opacity}${rotation}${scale}${parent}${visibility}`
}

export function serializeScene(scene: ChronoScene): string {
  const comp = scene.composition
  const lines: string[] = []

  lines.push(`Canvas: ${comp.width}×${comp.height}px | duration: ${comp.durationMs}ms | fps: ${comp.frameRate}`)
  lines.push(`Background: ${comp.backgroundColor || '#000000'}`)

  lines.push(`\nLayers (${scene.layers.length}):`)
  if (scene.layers.length === 0) {
    lines.push('  (empty — no layers)')
  } else {
    for (const layer of scene.layers) {
      lines.push(describeLayer(layer))
    }
  }

  lines.push(`\nTimelines (${scene.timelines.length}):`)
  if (scene.timelines.length === 0) {
    lines.push('  (no timelines — create one before adding keyframes)')
  } else {
    for (const tl of scene.timelines) {
      const flags = [
        tl.autoplay ? 'autoplay' : '',
        tl.loop ? (tl.loopCount ? `loop×${tl.loopCount}` : 'loop∞') : '',
        tl.pingPong ? 'pingPong' : '',
      ].filter(Boolean).join(' ')
      lines.push(`  • id="${tl.id}" duration=${tl.durationMs}ms ${flags}`)
      for (const track of tl.tracks) {
        const kfTimes = track.keyframes.map((k) => `${k.timeMs}ms`).join(', ')
        lines.push(`    track: "${track.target}" keyframes=[${kfTimes}]`)
      }
    }
  }

  if (scene.parameters && scene.parameters.length > 0) {
    lines.push(`\nParameters (${scene.parameters.length}):`)
    for (const p of scene.parameters) {
      lines.push(`  • id="${p.id}" name="${p.name}" type=${p.type} default=${p.defaultValue}`)
    }
  }

  return lines.join('\n')
}
