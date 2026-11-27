import type { ModelViewCamera } from './types'
import { VIEW_DIRECTIONS, cameraForViewDirection } from './viewDirections'
import { MODEL_VIEW_KEY_ACTIONS } from './viewShortcuts'

export type ModelViewPreset = 'front' | 'right' | 'left' | 'top' | 'bottom' | 'isometric' | 'perspective' | 'orthographic'

const directionFor: Record<Exclude<ModelViewPreset, 'perspective' | 'orthographic'>, string> = {
  front: 'Front', right: 'Right', left: 'Left', top: 'Top', bottom: 'Bottom', isometric: 'Top Front Right',
}

/** Apply a viewport-only preset while preserving camera target and scale.
 * Axis faces keep the current projection; true isometric uses an orthographic
 * projection with equal XYZ direction. The output camera changes only through
 * the existing explicit Use view action. */
export function modelViewPreset(camera: ModelViewCamera, preset: ModelViewPreset): ModelViewCamera {
  if (preset === 'perspective' || preset === 'orthographic') return { ...camera, projection: preset }
  const direction = VIEW_DIRECTIONS.find(item => item.label === directionFor[preset])!
  const oriented = cameraForViewDirection(camera, direction)
  return preset === 'isometric' ? { ...oriented, projection: 'orthographic' } : oriented
}

/** Resolve a key only after the focused 3D viewport has excluded modifiers. */
export function modelViewPresetForKey(key: string): ModelViewPreset | 'frame' | undefined {
  const normalized = key.toLowerCase()
  return Object.prototype.hasOwnProperty.call(MODEL_VIEW_KEY_ACTIONS, normalized) ? MODEL_VIEW_KEY_ACTIONS[normalized] : undefined
}

/** Resolve the shared 3D navigation chords. The viewport tool decides whether
 * an unmodified left drag pans, orbits, or edits before calling this fallback.
 * Right drag tilts and Shift+right drag rolls in Chorono. */
export function inspectionPointerMode(button: number, shift: boolean, alt: boolean, ctrl = false): 'orbit' | 'pan' | 'tilt' | 'dolly' | 'roll' {
  if (button === 1) return ctrl && alt ? 'dolly' : alt ? 'orbit' : 'pan'
  if (button === 2 && shift) return 'roll'
  return shift ? 'pan' : button === 2 || alt ? 'tilt' : 'orbit'
}
