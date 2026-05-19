// ── Motion Blur Bake Command ───────────────────────────────────────────────────
//
// makeBakeMotionBlurCmd — converts real-time motion blur evaluation into
// ordinary animated layers:
//   1. Creates a group layer to contain the trail copies.
//   2. For each trail index i (1..trailCount) creates an `instanceOf` layer
//      whose transform / opacity tracks are time-shifted copies of the source.
//   3. Sets layer.motionBlur.baked = true so CanvasRenderer skips real-time
//      evaluation and the baked group renders normally.
//
// makeUnbakeMotionBlurCmd — reverses the above, removing the group and its
// trail children and restoring real-time mode.
//
// Both commands are fully undo-safe (execute / undo snapshot pattern).

import type { ChronoScene, Layer, Track, Keyframe } from '../types'
import type { EditorCommand } from './commands-keyframe'
import { newGroupLayer } from '@/lib/registry/definitions/scene/GroupDefinition'
import { cloneSingleLayer } from '@/lib/clone/CloneSingleLayer'
import { DEFAULT_MOTION_BLUR } from '@/lib/defaults'

const freshKfId = () => `kf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
const freshTrackId = () => `trk_mb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

// Properties we time-shift from the source layer
const SHIFTED_PROPS = [
  'transform.x',
  'transform.y',
  'transform.rotationDeg',
  'transform.scaleX',
  'transform.scaleY',
  'opacity',
]

function shiftKeyframes(keyframes: Keyframe[], deltaMs: number): Keyframe[] {
  return keyframes.map(kf => ({
    ...kf,
    id:     freshKfId(),
    timeMs: Math.max(0, kf.timeMs - deltaMs),
  }))
}

/**
 * Creates a baked motion blur group for the given layer.
 * Returns null if the layer has no motionBlur config or no transform tracks.
 */
export function makeBakeMotionBlurCmd(
  scene: ChronoScene,
  layerId: string,
): EditorCommand | null {
  const sourceLayer = scene.layers.find(l => l.id === layerId)
  if (!sourceLayer) return null

  const mb = sourceLayer.motionBlur ?? DEFAULT_MOTION_BLUR
  if (!mb.enabled) return null

  const intervalMs = mb.frameInterval > 0
    ? mb.frameInterval
    : 1000 / scene.composition.frameRate

  // Capture the scene snapshot so undo can restore it completely
  const sceneBefore = scene

  // Pre-build the baked artefacts (group + trail layers + new tracks)
  // so the same objects are reused across execute/undo cycles.
  const group = newGroupLayer()
  group.name  = `MB: ${sourceLayer.name}`

  // Build trail layers and their time-shifted tracks
  const trailLayers: Layer[] = []
  const addedTracksByTimeline: Map<string, Track[]> = new Map()

  for (let i = 1; i <= mb.trailCount; i++) {
    const { clonedLayer } = cloneSingleLayer(sourceLayer, { mode: 'instance' })
    clonedLayer.parentId = group.id
    clonedLayer.name     = `Trail ${i}`
    clonedLayer.opacity  = mb.maxOpacity * (1 - (i - 1) / mb.trailCount)
    // Trails should NOT inherit motionBlur — they'd recurse
    delete clonedLayer.motionBlur

    trailLayers.push(clonedLayer)

    // For each timeline, copy source tracks and time-shift them for this trail
    for (const tl of scene.timelines) {
      const sourceTracks = tl.tracks.filter(t =>
        SHIFTED_PROPS.some(prop => t.target === `layers.${layerId}.${prop}`),
      )
      if (sourceTracks.length === 0) continue

      const newTracks: Track[] = sourceTracks.map(src => ({
        ...src,
        id:        freshTrackId(),
        target:    src.target.replace(`layers.${layerId}.`, `layers.${clonedLayer.id}.`),
        keyframes: shiftKeyframes(src.keyframes, i * intervalMs),
      }))

      const existing = addedTracksByTimeline.get(tl.id) ?? []
      addedTracksByTimeline.set(tl.id, [...existing, ...newTracks])
    }
  }

  const addedLayerIds  = [group.id, ...trailLayers.map(l => l.id)]
  const addedLayersAll = [group, ...trailLayers]

  return {
    label: `Bake Motion Blur — ${sourceLayer.name}`,

    execute(s: ChronoScene): ChronoScene {
      const layers = [
        ...s.layers.map(l =>
          l.id === layerId
            ? { ...l, motionBlur: { ...(l.motionBlur ?? DEFAULT_MOTION_BLUR), baked: true, bakedGroupId: group.id } }
            : l,
        ),
        ...addedLayersAll,
      ]

      const timelines = s.timelines.map(tl => {
        const extra = addedTracksByTimeline.get(tl.id)
        return extra ? { ...tl, tracks: [...tl.tracks, ...extra] } : tl
      })

      return { ...s, layers, timelines }
    },

    undo(_s: ChronoScene): ChronoScene {
      // Full snapshot restore — simplest and safest approach
      return sceneBefore
    },
  }
}

/**
 * Removes a baked motion blur group and restores real-time mode.
 * Returns null if the layer is not baked.
 */
export function makeUnbakeMotionBlurCmd(
  scene: ChronoScene,
  layerId: string,
): EditorCommand | null {
  const sourceLayer = scene.layers.find(l => l.id === layerId)
  if (!sourceLayer?.motionBlur?.baked) return null

  const groupId     = sourceLayer.motionBlur.bakedGroupId
  const sceneBefore = scene

  return {
    label: `Clear Motion Blur Bake — ${sourceLayer.name}`,

    execute(s: ChronoScene): ChronoScene {
      // Remove group + all its children
      const groupChildIds = groupId
        ? s.layers.filter(l => l.parentId === groupId).map(l => l.id)
        : []
      const removeIds = new Set([...(groupId ? [groupId] : []), ...groupChildIds])

      const layers = s.layers
        .filter(l => !removeIds.has(l.id))
        .map(l => l.id === layerId
          ? { ...l, motionBlur: { ...l.motionBlur!, baked: false, bakedGroupId: undefined } }
          : l,
        )

      // Remove tracks that target removed layers
      const timelines = s.timelines.map(tl => ({
        ...tl,
        tracks: tl.tracks.filter(t =>
          !Array.from(removeIds).some(id => t.target.startsWith(`layers.${id}.`)),
        ),
      }))

      return { ...s, layers, timelines }
    },

    undo(_s: ChronoScene): ChronoScene {
      return sceneBefore
    },
  }
}
