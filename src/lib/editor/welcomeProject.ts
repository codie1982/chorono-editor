import { emptyScene, newTimeline } from '@/lib/defaults'
import { COMPOSITION_PRESETS, type ChronoScene } from '@/lib/types'

/** Explicit startup settings; the source composition is never used as a template. */
export interface WelcomeProjectSettings {
  name: string
  presetId: string
  frameRate: number
}

/**
 * Creates an independent empty project from the existing composition presets.
 * Dimensions are backing composition pixels; frameRate is frames per second.
 * Rejects missing names, unknown/custom presets and unsupported frame rates
 * before the caller replaces its current scene. History/confirmation belongs
 * to the editor command boundary, not this factory.
 */
export function createWelcomeProject(settings: WelcomeProjectSettings): ChronoScene {
  const name = settings.name.trim()
  const preset = COMPOSITION_PRESETS.find(item => item.id === settings.presetId && item.width > 0 && item.height > 0)
  if (!name) throw new Error('Enter a project name.')
  if (!preset) throw new Error('Choose a valid canvas size.')
  if (!Number.isInteger(settings.frameRate) || settings.frameRate < 1 || settings.frameRate > 120) {
    throw new Error('Frame rate must be a whole number between 1 and 120.')
  }
  const scene = emptyScene()
  scene.composition = {
    ...scene.composition, id: name, width: preset.width, height: preset.height,
    frameRate: settings.frameRate,
  }
  const timeline = newTimeline()
  timeline.durationMs = scene.composition.durationMs
  scene.timelines = [timeline]
  return scene
}
