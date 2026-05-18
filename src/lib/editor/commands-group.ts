// ── Group / Ungroup Commands ──────────────────────────────────────────────────
//
// makeGroupCmd      → wraps N selected layers under a fresh group, sets their
//                     parentId. Atomic undo.
// makeUngroupCmd    → removes a group layer, promotes its children to its
//                     parent (or to root). Atomic undo.
//
// Group layer is created fresh per call (id stays stable across undo/redo —
// the same Layer object reference is added & removed).

import type { ChronoScene, Layer, Track, Keyframe } from '../types'
import type { EditorCommand } from './commands-keyframe'
import { newGroupLayer } from '@/lib/registry/definitions/scene/GroupDefinition'
import { Matrix2D } from '../geometry/Matrix2D'

/** Generate a fresh keyframe id without depending on the global counter. */
const freshKfId = () => `kf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

export interface GroupCmdResult extends EditorCommand {
  /** Id of the freshly created group (so the caller can select it). */
  groupId: string
}

export function makeGroupCmd(layerIds: string[]): GroupCmdResult {
  // Create the group eagerly so the id is known before execute() runs.
  const group: Layer = newGroupLayer()

  return {
    label:  `Group ${layerIds.length} layer${layerIds.length === 1 ? '' : 's'}`,
    groupId: group.id,

    execute(scene: ChronoScene): ChronoScene {
      // Determine the common parent (if all share one). The new group inherits
      // that parentId so it lands at the same hierarchy level.
      const targets = scene.layers.filter(l => layerIds.includes(l.id))
      if (targets.length === 0) return scene

      const sharedParent = targets[0].parentId
      const allSameParent = targets.every(l => l.parentId === sharedParent)
      const groupWithParent: Layer = allSameParent
        ? { ...group, parentId: sharedParent }
        : group

      // Insert the group just BEFORE the topmost target's index so render order
      // is preserved (children-rendered-in-array-order semantics).
      const topmostIdx = Math.max(...targets.map(t => scene.layers.indexOf(t)))

      const updatedLayers: Layer[] = []
      let inserted = false
      for (let i = 0; i < scene.layers.length; i++) {
        const l = scene.layers[i]
        if (layerIds.includes(l.id)) {
          // Re-parent under the group
          updatedLayers.push({ ...l, parentId: groupWithParent.id })
        } else {
          updatedLayers.push(l)
        }
        if (i === topmostIdx && !inserted) {
          updatedLayers.push(groupWithParent)
          inserted = true
        }
      }
      if (!inserted) updatedLayers.push(groupWithParent)

      return { ...scene, layers: updatedLayers }
    },

    undo(scene: ChronoScene): ChronoScene {
      // Remove the group; restore children's previous parentId by reading
      // from the group's original parentId field (children may have been
      // root before — they go back to root by reverting parentId).
      const groupLayer = scene.layers.find(l => l.id === group.id)
      const restoredParentId = groupLayer?.parentId

      return {
        ...scene,
        layers: scene.layers
          .filter(l => l.id !== group.id)
          .map(l => layerIds.includes(l.id) ? { ...l, parentId: restoredParentId } : l),
      }
    },
  }
}

/**
 * Ungroup: removes the group layer and re-parents its children to the group's
 * parent (or root). Animations are PRESERVED:
 *
 *   1. The group's static transform is BAKED into each child's transform —
 *      so children visually stay where they were post-render.
 *   2. The group's animation tracks (transform.x/y/scale/rotation/opacity)
 *      are DUPLICATED onto each child. Same keyframes, fresh ids per track.
 *      This means a "group fading in" stays as "every child fading in" after
 *      ungroup — visually identical.
 *
 * Children that already had their own tracks on the same property keep them;
 * the duplicated group track is added ADDITIVELY only if the child has no
 * pre-existing track for that property (to avoid double-animation).
 *
 * Snapshots the full pre-execute scene state for clean undo.
 */
export function makeUngroupCmd(scene: ChronoScene, groupId: string): EditorCommand | null {
  const groupSnapshot = scene.layers.find(l => l.id === groupId && l.type === 'group')
  if (!groupSnapshot) return null

  const newParentId = groupSnapshot.parentId
  // Full child snapshots (so undo can restore parentId AND transform)
  const childSnapshots = scene.layers
    .filter(l => l.parentId === groupId)
    .map(l => ({ id: l.id, prevParentId: l.parentId, prevTransform: { ...l.transform } }))
  const childIds = childSnapshots.map(c => c.id)

  // Capture the group's tracks across every timeline
  const groupTrackPrefix = `layers.${groupId}.`
  const groupTracks: Array<{ timelineId: string; track: Track }> = []
  for (const tl of scene.timelines) {
    for (const t of tl.tracks) {
      if (t.target.startsWith(groupTrackPrefix)) {
        groupTracks.push({ timelineId: tl.id, track: t })
      }
    }
  }

  return {
    label: 'Ungroup',

    execute(s: ChronoScene): ChronoScene {
      // ── 1. Update layers: remove group, reparent + bake FULL group transform
      //    into each child via matrix composition (BL-03). Used to be
      //    translate-only; now rotation + scale are preserved so the visual
      //    layout doesn't change when ungrouping a rotated/scaled group.
      const gt = groupSnapshot.transform
      const groupMat = Matrix2D.translation(gt.x, gt.y)
        .rotate(gt.rotationDeg ?? 0)
        .scale(gt.scaleX ?? 1, gt.scaleY ?? 1)

      const layers = s.layers
        .filter(l => l.id !== groupId)
        .map(l => {
          if (l.parentId !== groupId) return l
          const ct = l.transform
          const childMat = Matrix2D.translation(ct.x, ct.y)
            .rotate(ct.rotationDeg ?? 0)
            .scale(ct.scaleX ?? 1, ct.scaleY ?? 1)
          const composed = groupMat.multiply(childMat)
          const d = composed.decompose()
          return {
            ...l,
            parentId: newParentId,
            transform: {
              ...l.transform,
              x: d.x,
              y: d.y,
              rotationDeg: d.rotation,
              scaleX: d.scaleX,
              scaleY: d.scaleY,
            },
          }
        })

      // ── 2. Update timelines: remove group tracks, duplicate to children ──
      const timelines = s.timelines.map(tl => {
        // Remove group's own tracks
        const remaining = tl.tracks.filter(t => !t.target.startsWith(groupTrackPrefix))

        // For each (group track, child), create a duplicate targeting the child
        const additions: Track[] = []
        for (const childId of childIds) {
          for (const { timelineId, track } of groupTracks) {
            if (timelineId !== tl.id) continue
            const property = track.target.slice(groupTrackPrefix.length)
            const newTarget = `layers.${childId}.${property}`

            // Skip if the child already has a track on this property
            const childHasTrack =
              remaining.some(t => t.target === newTarget) ||
              additions.some(t => t.target === newTarget)
            if (childHasTrack) continue

            additions.push({
              target:    newTarget,
              label:     track.label,
              keyframes: track.keyframes.map<Keyframe>(k => ({
                ...k,
                id: freshKfId(),
              })),
            })
          }
        }
        return { ...tl, tracks: [...remaining, ...additions] }
      })

      return { ...s, layers, timelines }
    },

    undo(_s: ChronoScene): ChronoScene {
      // Full pre-execute snapshot restore. We capture only what changed —
      // the group itself, the children's parentId+transform, and the tracks.
      // To restore, walk current state and patch back:
      //   - Re-add the group layer
      //   - Reset each child's parentId + transform to snapshot
      //   - Remove duplicated child tracks; re-add group tracks
      // (Other unrelated changes since execute are preserved.)
      const cur = _s
      const childTrackTargets = new Set<string>()
      for (const id of childIds) {
        for (const { track } of groupTracks) {
          const prop = track.target.slice(groupTrackPrefix.length)
          childTrackTargets.add(`layers.${id}.${prop}`)
        }
      }

      const layers = [
        ...cur.layers.map(l => {
          const snap = childSnapshots.find(c => c.id === l.id)
          return snap
            ? { ...l, parentId: snap.prevParentId, transform: snap.prevTransform }
            : l
        }),
        groupSnapshot,
      ]

      const timelines = cur.timelines.map(tl => {
        // Drop the duplicated child tracks (only those we added)
        const cleaned = tl.tracks.filter(t => !childTrackTargets.has(t.target))
        // Re-add the original group tracks belonging to THIS timeline
        const restored: Track[] = groupTracks
          .filter(({ timelineId }) => timelineId === tl.id)
          .map(({ track }) => track)
        return { ...tl, tracks: [...cleaned, ...restored] }
      })

      return { ...cur, layers, timelines }
    },
  }
}
