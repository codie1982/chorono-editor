import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { runSafeScript } from '../sandbox'
import { fakeEditor } from './support/fakeEditor'
import { emptyScene, newRectLayer, newTextLayer } from '../../defaults'
import { evaluateSceneFrame } from '../../runtime/evaluateSceneFrame'
import { getCapabilities } from '../catalog'

/** Actual protocol/source fixture; manual key/fallback survive agent recipes. */
function fixture() {
  const scene = emptyScene(); scene.layers = [{ ...newRectLayer(), id: 'hero', name: 'Hero card' }]
  scene.timelines = [{ id: 'intro', durationMs: 2000, loop: false, autoplay: true, tracks: [{ target: 'layers.hero.transform.x', keyframes: [{ id: 'manual-key', timeMs: 0, value: 905, easing: { type: 'linear' as const } }] }] }]
  return scene
}

describe('MCP property-expression source contract', () => {
  it('authors exact boolean source/results through QuickJS without replacing unrelated manual keys', async () => {
    const scene = fixture(), text = { ...newTextLayer(), id: 'label' }
    scene.layers.push(text); scene.parameters = [{ id: 'gate', name: 'Gate', type: 'boolean', defaultValue: true }]
    const markdown = await readFile('docs/tr/boolean-expressions.md', 'utf8')
    const script = /```js\n([\s\S]*?)```/.exec(markdown)![1]
    const result = await runSafeScript(script, scene)
    expect(evaluateSceneFrame(result.scene, 500).overrides.get('layers.label.text.uppercase')).toBe(true)
    expect(result.scene.timelines[0].tracks).toEqual(scene.timelines[0].tracks)
    const capabilities = await getCapabilities('standard', { summary: true })
    expect((capabilities as any).propertyExpressions.resultTypes).toEqual(['number', 'boolean'])
  })
  it('runs the documented example in QuickJS and keeps manual source/keys', async () => {
    const markdown = await readFile('docs/tr/property-expressions.md', 'utf8')
    const script = /```js\n([\s\S]*?)```/.exec(markdown)![1], scene = fixture()
    const result = await runSafeScript(script, scene)
    expect(evaluateSceneFrame(result.scene, 700).overrides.get('layers.hero.size.width')).toBeCloseTo(80 + 20 * Math.sin(1.4))
    expect(result.scene.timelines[0].tracks).toEqual(scene.timelines[0].tracks)
    expect(result.scene.layers[0].size?.width).toBe(160)
    expect(scene.layers[0].propertyExpressions).toBeUndefined()
    await expect(runSafeScript("scene.get('hero').set({propertyExpressions:{version:1,fields:{'size.width':{resultType:'number',formula:'1',timelineId:'intro',sources:{timeSec:{layerId:'hero',propertyPath:'size.height',valueType:'number'}}}}}})", scene)).rejects.toThrow(/reserved/)
  })
  it('discovers schema and applies a native source patch with one Undo/Redo through the real broker', async () => {
    const capabilities = await getCapabilities('standard', { toolName: 'replace_layer_fields' })
    expect((capabilities as any).tool.inputSchema.properties.patch.properties.propertyExpressions.properties.version.enum).toEqual([1])
    const editor = fakeEditor('Property expression acceptance'), scene = fixture(); editor.replaceDocument(scene)
    try {
      await editor.call('replace_layer_fields', { layerId: 'hero', patch: { propertyExpressions: { version: 1, fields: {
        'size.width': { resultType: 'number', formula: '100+timeSec*20', timelineId: 'intro', sources: {} },
      } } } })
      const source = editor.host.editor.getScene()
      expect(editor.historyLength()).toBe(1)
      expect(source.timelines[0].tracks).toEqual(scene.timelines[0].tracks)
      expect(evaluateSceneFrame(source, 500).overrides.get('layers.hero.size.width')).toBe(110)
      editor.host.editor.undo(); expect(editor.host.editor.getScene()).toBe(scene)
      editor.host.editor.redo(); expect(editor.host.editor.getScene().layers[0].propertyExpressions).toEqual(source.layers[0].propertyExpressions)
    } finally { await editor.close() }
  })
})
