// ── Layer Commands ────────────────────────────────────────────────────────────

import type { ChronoScene, Layer } from '../types'
import type { EditorCommand } from './commands-keyframe'

// ── Add layer ─────────────────────────────────────────────────────────────────

export function makeAddLayerCmd(layer: Layer): EditorCommand {
  return {
    label: `Add ${layer.type} layer`,
    execute: (scene) => ({ ...scene, layers: [...scene.layers, layer] }),
    undo:    (scene) => ({ ...scene, layers: scene.layers.filter((l) => l.id !== layer.id) }),
  }
}

// ── Delete layer ──────────────────────────────────────────────────────────────

export function makeDeleteLayerCmd(layer: Layer): EditorCommand {
  return {
    label: `Delete ${layer.name}`,
    execute: (scene) => ({ ...scene, layers: scene.layers.filter((l) => l.id !== layer.id) }),
    undo:    (scene) => ({ ...scene, layers: [...scene.layers, layer] }),
  }
}

// ── Update layer (patch) ──────────────────────────────────────────────────────

export function makeUpdateLayerCmd(
  layerId: string,
  patch: Partial<Layer>,
  prevLayer: Layer,
): EditorCommand {
  const next: Layer = { ...prevLayer, ...patch }
  return {
    label: 'Update Layer',
    execute: (scene) => ({
      ...scene,
      layers: scene.layers.map((l) => l.id === layerId ? next : l),
    }),
    undo: (scene) => ({
      ...scene,
      layers: scene.layers.map((l) => l.id === layerId ? prevLayer : l),
    }),
  }
}

// ── Reorder layer ─────────────────────────────────────────────────────────────

export function makeMoveLayerCmd(
  layerId: string,
  fromIndex: number,
  toIndex: number,
): EditorCommand {
  function reorder(layers: Layer[], from: number, to: number): Layer[] {
    const next = [...layers]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    return next
  }

  return {
    label: 'Reorder Layer',
    execute: (scene) => ({ ...scene, layers: reorder(scene.layers, fromIndex, toIndex) }),
    undo:    (scene) => ({ ...scene, layers: reorder(scene.layers, toIndex, fromIndex) }),
  }
}

// ── Trim layer (shift startMs / endMs) ───────────────────────────────────────

export function makeTrimLayerCmd(
  layerId: string,
  edge: 'start' | 'end',
  fromMs: number,
  toMs: number,
): EditorCommand {
  const field = edge === 'start' ? 'startMs' : 'endMs'
  return {
    label: `Trim ${edge}`,
    execute: (scene) => ({
      ...scene,
      layers: scene.layers.map((l) => l.id === layerId ? { ...l, [field]: toMs } : l),
    }),
    undo: (scene) => ({
      ...scene,
      layers: scene.layers.map((l) => l.id === layerId ? { ...l, [field]: fromMs } : l),
    }),
  }
}

// ── Toggle layer flag (locked / hidden / solo) ────────────────────────────────

export function makeToggleLayerCmd(
  layerId: string,
  field: 'locked' | 'hidden' | 'solo',
): EditorCommand {
  return {
    label: `Toggle ${field}`,
    execute: (scene) => ({
      ...scene,
      layers: scene.layers.map((l) => l.id === layerId ? { ...l, [field]: !l[field] } : l),
    }),
    undo: (scene) => ({
      ...scene,
      layers: scene.layers.map((l) => l.id === layerId ? { ...l, [field]: !l[field] } : l),
    }),
  }
}

// ── Duplicate layer ───────────────────────────────────────────────────────────

export function makeDuplicateLayerCmd(
  original: Layer,
  newLayer: Layer,
): EditorCommand {
  return {
    label: `Duplicate ${original.name}`,
    execute: (scene) => ({ ...scene, layers: [...scene.layers, newLayer] }),
    undo:    (scene) => ({ ...scene, layers: scene.layers.filter((l) => l.id !== newLayer.id) }),
  }
}
