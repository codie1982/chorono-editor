import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { evaluateNumericTrack } from '../../evaluator'
import { emptyScene } from '../../defaults'
import { runSafeScript } from '../sandbox'
import { assertScene } from '../protocol'

describe('documented scripting workflows', () => {
  for (const language of ['en', 'tr']) {
    it(`runs the ${language} scene construction and safe editing examples in QuickJS`, async () => {
      const markdown = await readFile(path.resolve(`docs/${language}/scripting.md`), 'utf8')
      const blocks = Array.from(markdown.matchAll(/```js\n([\s\S]*?)```/g), match => match[1])
      expect(blocks).toHaveLength(2)
      const built = await runSafeScript(blocks[1], emptyScene())
      const edited = await runSafeScript(blocks[0], built.scene)
      assertScene(edited.scene)
      const hero = edited.scene.layers.find(layer => layer.name === 'Hero card')!
      expect(edited.scene.timelines.map(timeline => timeline.id)).toEqual(['intro', 'idle'])
      expect(hero.style?.fill?.color).toBe('#2563eb')
      expect(hero.style?.stroke?.color).toBe('#ffffff')
      expect(hero.style?.stroke?.width).toBe(2)
      expect(edited.scene.timelines[0].tracks.find(track => track.target === `layers.${hero.id}.style.fill.color`)?.keyframes).toHaveLength(2)
      const signal = edited.scene.timelines[1].tracks[0]
      expect(signal.controller?.type).toBe('waveform')
      expect(signal.keyframes).toEqual([])
      expect(evaluateNumericTrack(signal, Math.PI * 250)).toBeCloseTo(172, 9)
      expect(evaluateNumericTrack(signal, 1000)).toBeCloseTo(160 + 12 * Math.sin(2), 9)
    })
  }
})
