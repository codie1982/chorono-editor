import type { Model3DData } from '../types'
import { modelChannels } from './modelChannels'
import type { Timeline } from '../../types'
import { measureJson } from '../../format/json'
import { parseTrackTarget } from '../../timeline/TrackTargetParser'
import { boundedKeyTime } from '../../timeline/authoring/keyTimePolicy'
import { SIMPLE_EASING_TYPES } from '../../animation/typedValueSchema'
import { assertTrackValues } from '../../animation/typedValues'
import { assertModelChannelValue, readModelChannelValue } from './modelChannels'
import { isPrimitiveChannel } from './modelPrimitiveChannels'

/** Private stable root; no scene layer IDs enter persisted clip targets. */
export const MODEL_CONTENT_ROOT = 'content'
export interface ModelContentClip extends Timeline { name: string }
/** Serializable authored source only. Reuses Timeline/key/easing formats;
 * renderer handles, compiled code, samples and clocks never enter this record.
 */
export interface ModelContentAnimation { version: 1 | 2; activeClipId: string | null; clips: ModelContentClip[] }
export const MAX_MODEL_CLIPS = 16
const easingTypes = new Set<string>([...SIMPLE_EASING_TYPES, 'customBezier'])

/** Bounded import/commit validation, never source normalization. Private clips
 * support registered numeric, boolean and color keys, not event/audio/SM or procedural signal authoring. The
 * JSON preflight rejects functions/accessors/native values/cycles before clone.
 */
export function assertModelContentAnimation(value: ModelContentAnimation, data?: Model3DData): void {
  measureJson(value, { maxBytes: 4 * 1024 ** 2, maxChars: 4 * 1024 ** 2, maxNodes: 100000 })
  if (!value || ![1, 2].includes(value.version) || !Array.isArray(value.clips) || value.clips.length > MAX_MODEL_CLIPS) throw new Error('Invalid or oversized model clips.')
  const allowed = new Set(modelChannels(data))
  const v1 = new Set([...modelChannels(data).filter(path => !isPrimitiveChannel(path) && !path.startsWith('model3d.lighting.')
    && !path.includes('.materials.') && !path.includes('.light.') && !path.includes('.environment.'))])
  const clips = new Set<string>(), keys = new Set<string>()
  for (const clip of value.clips) {
    if (!clip || typeof clip.id !== 'string' || !clip.id || clip.id.length > 160 || clips.has(clip.id) || typeof clip.name !== 'string' || !clip.name.trim() || clip.name.length > 120
      || !Number.isFinite(clip.durationMs) || clip.durationMs < 1 || clip.durationMs > 86400000 || !Array.isArray(clip.tracks) || clip.tracks.length > allowed.size
      || typeof clip.loop !== 'boolean' || typeof clip.autoplay !== 'boolean' || clip.pingPong || clip.loopCount
      || clip.events?.length || clip.segments?.length || clip.layerIds?.some(id => id !== MODEL_CONTENT_ROOT)) throw new Error('Invalid model clip identity, duration or track count.')
    clips.add(clip.id)
    const targets = new Set<string>()
    for (const track of clip.tracks) {
      const target = parseTrackTarget(track.target)
      if (!target || target.entityType !== 'layer' || target.entityId !== MODEL_CONTENT_ROOT || !allowed.has(target.propertyPath)
        || value.version === 1 && !v1.has(target.propertyPath)
        || targets.has(track.target) || !Array.isArray(track.keyframes) || track.controller && track.controller.type !== 'keyframe'
        || track.modifiers?.length || track.timeWarp || track.easeCurve || track.multiplierCurve || track.outOfRange || track.multiplierAmplitude !== undefined) throw new Error('Unsupported model clip track or signal processor.')
      const authored = readModelChannelValue({ model3d: data } as import('../../types').Layer, target.propertyPath)
      targets.add(track.target); assertTrackValues(track, authored ?? (target.propertyPath.endsWith('.visible') ? true : target.propertyPath.endsWith('.color') ? '#ffffff' : 0))
      for (const key of track.keyframes) {
        if (!key || typeof key.id !== 'string' || !key.id || keys.has(key.id) || keys.size >= 8192 || key.segmentModifiers?.length
          || !key.easing || !easingTypes.has(key.easing.type)) throw new Error('Invalid model clip key identity or easing.')
        keys.add(key.id); boundedKeyTime(key.timeMs, clip.durationMs); assertModelChannelValue(target.propertyPath, key.value, data)
        if (key.easing.type === 'customBezier') {
          const b = key.easing.bezier
          if (!b || ![b.cx1, b.cy1, b.cx2, b.cy2].every(Number.isFinite) || b.cx1 < 0 || b.cx1 > 1 || b.cx2 < 0 || b.cx2 > 1) throw new Error('Invalid model key Bézier easing.')
        }
      }
    }
  }
  if (value.activeClipId !== null && !clips.has(value.activeClipId)) throw new Error('The active model clip is missing.')
}
