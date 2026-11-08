import { describe, expect, it } from 'vitest'
import { COMPOSITION_PRESETS } from '@/lib/types'
import { createWelcomeProject } from '../welcomeProject'

describe('welcome project creation', () => {
  it.each(['youtube', 'square', 'story'])('uses the existing %s preset and a usable selected timeline', presetId => {
    const preset = COMPOSITION_PRESETS.find(item => item.id === presetId)!
    const scene = createWelcomeProject({ name: '  İlk animasyon  ', presetId, frameRate: 30 })
    expect(scene.composition).toMatchObject({ id: 'İlk animasyon', width: preset.width, height: preset.height, frameRate: 30 })
    expect(scene.layers).toEqual([])
    expect(scene.assets).toEqual([])
    expect(scene.timelines).toHaveLength(1)
    expect(scene.timelines[0].durationMs).toBe(scene.composition.durationMs)
    expect(scene.timelines[0].tracks).toEqual([])
  })

  it('creates independent projects without sharing mutable timelines or composition', () => {
    const settings = { name: 'New project', presetId: 'square', frameRate: 60 }
    const a = createWelcomeProject(settings), b = createWelcomeProject(settings)
    a.composition.width = 1
    a.timelines[0].tracks.push({ target: 'layers.test.opacity', keyframes: [] })
    expect(b.composition.width).toBe(1080)
    expect(b.timelines[0].tracks).toEqual([])
    expect(a.timelines[0].id).not.toBe(b.timelines[0].id)
  })

  it.each([
    { name: '  ', presetId: 'youtube', frameRate: 30 },
    { name: 'Test', presetId: 'custom', frameRate: 30 },
    { name: 'Test', presetId: 'missing', frameRate: 30 },
    { name: 'Test', presetId: 'youtube', frameRate: 0 },
    { name: 'Test', presetId: 'youtube', frameRate: 121 },
    { name: 'Test', presetId: 'youtube', frameRate: 29.5 },
  ])('rejects invalid startup settings before scene replacement: %j', settings => {
    expect(() => createWelcomeProject(settings)).toThrow()
  })
})
