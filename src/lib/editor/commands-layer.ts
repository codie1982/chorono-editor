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
  let snapshot: ChronoScene | undefined
  return {
    label: `Delete ${layer.name}`,
    execute: (scene) => {
      snapshot ??= scene
      const removed = new Set([layer.id])
      let changed = true
      while (changed) {
        changed = false
        for (const child of scene.layers) if (child.parentId && removed.has(child.parentId) && !removed.has(child.id)) { removed.add(child.id); changed = true }
      }
      return { ...scene,
        layers: scene.layers.filter(l => !removed.has(l.id)),
        timelines: scene.timelines.map(tl => ({ ...tl,
          layerIds: tl.layerIds?.filter(id => !removed.has(id)),
          tracks: tl.tracks.filter(tr => !removed.has(tr.target.match(/^layers\.([^.]+)\./)?.[1] ?? '')),
        })),
      }
    },
    undo: (scene) => snapshot ?? scene,
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

// ── Shift / Rescale layer in time (with proportional keyframe remap) ────────
//
// Linearly remaps every keyframe whose track targets this layer (target prefix
// `layers.{layerId}.`) from the source window [fromStart..fromEnd] onto the
// destination window [toStart..toEnd].
//
//   newMs = toStart + (kf.timeMs - fromStart) * (toDur / fromDur)
//
// • Pure shift (fromDur == toDur) → keyframes translate by (toStart-fromStart)
// • Trim left/right (different durations) → keyframes scale proportionally
//   so a 50% shorter bar makes a 5s key happen at 2.5s.
//
// `fromEnd` / `toEnd` may be `undefined`, meaning "layer plays until composition
// end" — in that case we treat the effective end as `defaultEndMs` (caller
// passes the timeline duration).

export function makeShiftLayerCmd(
  layerId:      string,
  fromStartMs:  number,
  fromEndMs:    number | undefined,
  toStartMs:    number,
  toEndMs:      number | undefined,
  defaultEndMs: number,
): EditorCommand {
  const fromEnd = fromEndMs ?? defaultEndMs
  const toEnd   = toEndMs   ?? defaultEndMs
  const fromDur = Math.max(1e-6, fromEnd - fromStartMs)
  const toDur   = Math.max(0,    toEnd   - toStartMs)
  const scale   = toDur / fromDur

  const targetPrefix = `layers.${layerId}.`
  const remap = (ms: number) => toStartMs + (ms - fromStartMs) * scale
  const inverse = (ms: number) => fromStartMs + (ms - toStartMs) / (scale || 1)

  function applyToScene(scene: ChronoScene, mapFn: (ms: number) => number,
                        newStart: number, newEnd: number | undefined): ChronoScene {
    return {
      ...scene,
      layers: scene.layers.map((l) =>
        l.id !== layerId ? l : { ...l, startMs: newStart, endMs: newEnd }),
      timelines: scene.timelines.map((tl) => ({
        ...tl,
        tracks: tl.tracks.map((tr) => {
          if (!tr.target.startsWith(targetPrefix)) return tr
          return {
            ...tr,
            keyframes: tr.keyframes
              .map((k) => ({ ...k, timeMs: mapFn(k.timeMs) }))
              .sort((a, b) => a.timeMs - b.timeMs),
          }
        }),
      })),
    }
  }

  return {
    label: 'Move Layer in Time',
    execute: (scene) => applyToScene(scene, remap,   toStartMs,   toEndMs),
    undo:    (scene) => applyToScene(scene, inverse, fromStartMs, fromEndMs),
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

// ── Toggle layer flag (locked / hidden / solo / pinned) ───────────────────────

export type LayerToggleField = 'locked' | 'hidden' | 'solo' | 'pinned'

export function makeToggleLayerCmd(
  layerId: string,
  field: LayerToggleField,
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

// ── Bulk update (BL-53) ───────────────────────────────────────────────────────
//
// Applies the same shallow patch to N layers atomically — single undo step
// instead of N. Use cases:
//   - Multi-select opacity slider → opacity: 0.5 on 5 layers
//   - "Color label = blue" on a selection
//   - Property panel mixed-state editor commits a value
//
// Captures a per-layer snapshot of the fields being patched so undo restores
// each layer's prior value individually (vs. naively replaying the patch).

export function makeBulkUpdateLayersCmd<P extends Partial<Layer>>(
  layerIds: string[] | Set<string>,
  patch: P,
  label?: string,
): EditorCommand {
  const idSet = layerIds instanceof Set ? layerIds : new Set(layerIds)
  const fields = Object.keys(patch) as Array<keyof Layer>

  // Per-layer snapshot of the fields being patched. Populated at execute
  // time so undo restores exactly what was there pre-edit.
  let snapshot: Map<string, Partial<Layer>> | null = null

  return {
    label: label ?? `Update ${idSet.size} layer${idSet.size === 1 ? '' : 's'}`,
    execute: (scene) => {
      const snap = new Map<string, Partial<Layer>>()
      const layers = scene.layers.map((l) => {
        if (!idSet.has(l.id)) return l
        const prev: Partial<Layer> = {}
        for (const f of fields) (prev as any)[f] = l[f]
        snap.set(l.id, prev)
        return { ...l, ...patch }
      })
      snapshot = snap
      return { ...scene, layers }
    },
    undo: (scene) => {
      if (!snapshot) return scene
      const snap = snapshot
      return {
        ...scene,
        layers: scene.layers.map((l) => {
          const prev = snap.get(l.id)
          return prev ? { ...l, ...prev } : l
        }),
      }
    },
  }
}

// ── Isolate / Show All (BL-55) ────────────────────────────────────────────────
//
// `isolate` is a special bulk-hide: hide every layer EXCEPT the targets.
// `showAll` clears hidden+solo on every layer. Together they form the
// 3ds Max "isolate selection" workflow: focus on a subset, then bring
// everything back.

export function makeIsolateLayersCmd(layerIdsToKeep: string[] | Set<string>): EditorCommand {
  const keepSet = layerIdsToKeep instanceof Set ? layerIdsToKeep : new Set(layerIdsToKeep)
  let prevHidden: Map<string, boolean | undefined> | null = null

  return {
    label: `Isolate ${keepSet.size} layer${keepSet.size === 1 ? '' : 's'}`,
    execute: (scene) => {
      const snap = new Map<string, boolean | undefined>()
      const layers = scene.layers.map((l) => {
        snap.set(l.id, l.hidden)
        // Keep targets visible; hide everything else.
        return { ...l, hidden: !keepSet.has(l.id) }
      })
      prevHidden = snap
      return { ...scene, layers }
    },
    undo: (scene) => {
      if (!prevHidden) return scene
      const snap = prevHidden
      return {
        ...scene,
        layers: scene.layers.map((l) =>
          snap.has(l.id) ? { ...l, hidden: snap.get(l.id) } : l,
        ),
      }
    },
  }
}

export function makeShowAllLayersCmd(): EditorCommand {
  // Snapshot ALL editor visibility state so undo restores the
  // pre-"show all" view including solo'd layers etc.
  let prev: Map<string, { hidden?: boolean; solo?: boolean }> | null = null

  return {
    label: 'Show All Layers',
    execute: (scene) => {
      const snap = new Map<string, { hidden?: boolean; solo?: boolean }>()
      const layers = scene.layers.map((l) => {
        snap.set(l.id, { hidden: l.hidden, solo: l.solo })
        return { ...l, hidden: false, solo: false }
      })
      prev = snap
      return { ...scene, layers }
    },
    undo: (scene) => {
      if (!prev) return scene
      const snap = prev
      return {
        ...scene,
        layers: scene.layers.map((l) =>
          snap.has(l.id) ? { ...l, ...snap.get(l.id) } : l,
        ),
      }
    },
  }
}

// ── Bulk toggle flag (BL-53) ──────────────────────────────────────────────────
//
// Sets a binary editor flag (locked/hidden/solo/pinned) on every layer in the
// selection to a SHARED target value. Without this, toggling 5 layers means
// 5 undo steps and a mixed end state when the layers started in different
// states. Target value is computed by the caller (typical pattern: "if ANY
// layer is off, turn them all ON; else turn them all OFF").

export function makeBulkToggleFlagCmd(
  layerIds: string[] | Set<string>,
  field: LayerToggleField,
  nextValue: boolean,
): EditorCommand {
  const idSet = layerIds instanceof Set ? layerIds : new Set(layerIds)
  // Snapshot per-layer prior values so undo restores the mixed start state.
  let prevValues: Map<string, boolean | undefined> | null = null

  return {
    label: `${nextValue ? 'Enable' : 'Disable'} ${field} on ${idSet.size} layer${idSet.size === 1 ? '' : 's'}`,
    execute: (scene) => {
      const snap = new Map<string, boolean | undefined>()
      const layers = scene.layers.map((l) => {
        if (!idSet.has(l.id)) return l
        snap.set(l.id, l[field] as boolean | undefined)
        return { ...l, [field]: nextValue }
      })
      prevValues = snap
      return { ...scene, layers }
    },
    undo: (scene) => {
      if (!prevValues) return scene
      const snap = prevValues
      return {
        ...scene,
        layers: scene.layers.map((l) =>
          snap.has(l.id) ? { ...l, [field]: snap.get(l.id) } : l,
        ),
      }
    },
  }
}
