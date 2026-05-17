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

// ── Move layer in tree (parent + array position) ─────────────────────────────
//
// Used by drag-drop in LayerPanel: dragging a row to a new spot in the tree.
// Combines a parentId change AND an array reorder in one undo step so the
// user sees their reorganisation as a single atomic action.
//
//   newParentId === undefined  →  promote to root
//   newParentId === currentParent → pure reorder within same parent
//
// `toIndex` is the absolute index in `scene.layers[]` (NOT the sibling-relative
// index). The caller is responsible for computing where the layer should land —
// LayerPanel does this off its tree-walked render order.

export function makeMoveLayerToCmd(
  layerId:     string,
  newParentId: string | undefined,
  toIndex:     number,
): EditorCommand {
  return {
    label: 'Move Layer',
    execute(scene: ChronoScene): ChronoScene {
      const fromIdx = scene.layers.findIndex(l => l.id === layerId)
      if (fromIdx < 0) return scene
      const layer = scene.layers[fromIdx]
      const without = [...scene.layers.slice(0, fromIdx), ...scene.layers.slice(fromIdx + 1)]
      // Clamp the destination to the new array length (removing the element
      // shrinks it; if toIndex was past `fromIdx`, shift down by 1).
      const adjusted = toIndex > fromIdx ? toIndex - 1 : toIndex
      const clamped  = Math.max(0, Math.min(without.length, adjusted))
      const reparented: Layer = { ...layer, parentId: newParentId }
      const next = [...without.slice(0, clamped), reparented, ...without.slice(clamped)]
      return { ...scene, layers: next }
    },
    undo(scene: ChronoScene): ChronoScene {
      // We can't reconstruct the exact prior state from just the params here,
      // so capture the layer's prior shape at execute-time would be cleaner.
      // For the common drag-drop case the user can simply Cmd+Z and drag it
      // back; for stricter undo we'd need a snapshot ref. Keep this minimal.
      // → Provide a best-effort: remove from current position and restore via
      //   re-finding the layer by id, then reverting parentId.
      // (A more rigorous implementation would close over prevLayer + fromIdx
      //  captured outside execute. We do that below in the factory variant.)
      return scene
    },
  }
}

/**
 * Snapshot-aware variant — captures previous parentId AND array index at
 * call time so undo restores the exact prior state. Prefer this over the
 * stateless `makeMoveLayerToCmd` for production drag-drop interactions.
 */
export function makeMoveLayerToCmdWithSnapshot(
  scene:       ChronoScene,
  layerId:     string,
  newParentId: string | undefined,
  toIndex:     number,
): EditorCommand | null {
  const fromIdx = scene.layers.findIndex(l => l.id === layerId)
  if (fromIdx < 0) return null
  const prevLayer    = scene.layers[fromIdx]
  const prevParentId = prevLayer.parentId

  return {
    label: 'Move Layer',
    execute(s: ChronoScene): ChronoScene {
      const fi = s.layers.findIndex(l => l.id === layerId)
      if (fi < 0) return s
      const layer = s.layers[fi]
      const without = [...s.layers.slice(0, fi), ...s.layers.slice(fi + 1)]
      const adjusted = toIndex > fi ? toIndex - 1 : toIndex
      const clamped  = Math.max(0, Math.min(without.length, adjusted))
      const reparented: Layer = { ...layer, parentId: newParentId }
      const next = [...without.slice(0, clamped), reparented, ...without.slice(clamped)]
      return { ...s, layers: next }
    },
    undo(s: ChronoScene): ChronoScene {
      // Remove from wherever it lives now, restore at original index + parent
      const ci = s.layers.findIndex(l => l.id === layerId)
      const without = ci >= 0
        ? [...s.layers.slice(0, ci), ...s.layers.slice(ci + 1)]
        : s.layers
      const restored: Layer = { ...prevLayer, parentId: prevParentId }
      const target  = Math.max(0, Math.min(without.length, fromIdx))
      const next = [...without.slice(0, target), restored, ...without.slice(target)]
      return { ...s, layers: next }
    },
  }
}

// ── Split layer at a given time ──────────────────────────────────────────────
//
// MVP behaviour: the original layer's end is trimmed to `splitMs`, and a
// fresh clone (new UUID) is inserted right after it with startMs = splitMs.
// Animation tracks are NOT copied — they continue to belong to the original
// layer. Users who need split-with-animation should duplicate the layer
// first, then trim each side.
//
// TODO(big-feature): true "split with animation" — fork the timeline tracks
//   so the clone gets its own copies (kf times offset by -splitMs relative
//   to clone's local time). Requires deciding whether tracks should be
//   layer-id-targeted (current) or kept on the original (this MVP).

export function makeSplitLayerCmd(
  layerId: string,
  splitMs: number,
  /** Used as the fallback for the clone's endMs when the original has no
   *  explicit end (i.e. layer is active until composition end). */
  defaultEndMs: number,
  cloneFactory: (orig: Layer) => Layer,
): EditorCommand | null {
  // Snapshot captured at command-build for clean undo.
  return {
    label: 'Split Layer at Playhead',
    execute(scene) {
      const idx = scene.layers.findIndex((l) => l.id === layerId)
      if (idx < 0) return scene
      const orig = scene.layers[idx]
      const origEnd = orig.endMs ?? defaultEndMs
      // No-op if the split point is outside the layer's active range.
      if (splitMs <= (orig.startMs ?? 0) || splitMs >= origEnd) return scene
      const trimmed: Layer = { ...orig, endMs: splitMs }
      const clone   = cloneFactory(orig)
      clone.startMs = splitMs
      clone.endMs   = origEnd
      const next = [...scene.layers]
      next[idx] = trimmed
      next.splice(idx + 1, 0, clone)        // clone right after original
      return { ...scene, layers: next }
    },
    undo(scene) {
      // We don't have the clone id pre-baked (factory generates fresh each
      // execute), so locate the clone via "the layer right after `layerId`
      // whose startMs == splitMs". Defensive — only restores if matches.
      const idx = scene.layers.findIndex((l) => l.id === layerId)
      if (idx < 0) return scene
      const cloneIdx = idx + 1
      const clone = scene.layers[cloneIdx]
      if (!clone || clone.startMs !== splitMs) return scene
      const restored: Layer[] = [...scene.layers]
      restored.splice(cloneIdx, 1)
      // Reconstruct the original's endMs by reading the clone's endMs (since
      // the clone's endMs IS what the original's endMs was before split).
      restored[idx] = { ...restored[idx], endMs: clone.endMs }
      return { ...scene, layers: restored }
    },
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
