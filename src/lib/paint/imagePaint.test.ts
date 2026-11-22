import { describe, expect, it } from 'vitest'
import { fitImage, imagePlacement } from './imagePlacement'
import { compositionFill, compositionForOutput, withFillType, withStrokeType, strokeType } from './paintSource'
import { emptyScene, newRectLayer } from '../defaults'
import { makeImportImagePaintCmd, imagePaintTargetSignature } from '../editor/commands-image-paint'
import { AssetIndex } from '../asset/AssetIndex'
import { assertScenePaint } from './validatePaint'
import { exportSVG } from '../export/vector/SVGExporter'
import { RuntimeValidator } from '../export/RuntimeValidator'
import { exportToRuntime } from '../export/runtimeExport'
import { exportHTML } from '../export/html/htmlExport'
import { parseSceneJson } from '../format/scene/SceneJsonConverter'
import { cloneSingleLayer } from '../clone/CloneSingleLayer'
import { makeDuplicateLayerCmd } from '../editor/commands-layer'

const image = { version: 1 as const, assetId: 'picture', fit: 'cover' as const }
const asset = { id: 'picture', type: 'image' as const, name: 'Picture', url: 'data:image/png;base64,AA==', width: 200, height: 100 }
function fixture() {
  const scene = emptyScene(), shape = { ...newRectLayer(), id: 'hero' }
  shape.style = { fill: { type: 'solid', color: '#f00' }, stroke: { color: '#fff', width: 6, trim: { start: 0, end: 1, offset: 0 } } }
  scene.layers = [shape]; scene.assets = [asset]
  scene.timelines = [{ id: 'main', durationMs: 1000, loop: false, autoplay: false,
    tracks: [{ target: 'layers.hero.transform.x', keyframes: [{ id: 'human', timeMs: 500, value: 30, easing: { type: 'easeOut' }, tangentMode: 'broken' }] }] }]
  return scene
}

describe('shared image paint geometry', () => {
  it('fits Cover/Contain/Stretch and keeps natural-size frame semantics', () => {
    expect(fitImage('cover', 100, 100, 200, 100)).toEqual({ dx: -50, dy: 0, dw: 200, dh: 100 })
    expect(fitImage('contain', 100, 100, 200, 100)).toEqual({ dx: 0, dy: 25, dw: 100, dh: 50 })
    expect(fitImage('fill', 100, 100, 200, 100)).toEqual({ dx: 0, dy: 0, dw: 100, dh: 100 })
    expect(fitImage('none', 100, 100, 200, 100)).toEqual({ dx: -50, dy: 0, dw: 200, dh: 100 })
  })
  it('places about the local paint centre, then applies local-pixel offset', () => {
    expect(imagePlacement({ ...image, offsetX: 7, offsetY: -9, scale: 2, rotationDeg: 90 }, { x: 10, y: 20, width: 100, height: 100 }, 200, 100))
      .toEqual({ x: 67, y: 61, width: 200, height: 100, scale: 2, rotationDeg: 90 })
    expect(imagePlacement({ ...image, scale: 0 }, { x: 0, y: 0, width: 100, height: 100 }, 200, 100)).toBeNull()
    expect(fitImage('cover', 100, 100, 0, 100)).toBeNull()
  })
})
describe('source, import, clone and output paint contracts', () => {
  it('retains inactive fill/stroke channels and keys across None and Image switches', () => {
    const source = fixture(), fill = { ...source.layers[0].style!.fill!, gradient: { type: 'linear' as const, stops: [{ offset: 0, color: '#f00' }, { offset: 1, color: '#00f' }] }, image }
    expect(withFillType(withFillType(fill, 'none'), 'image').image).toBe(image)
    expect(withFillType(withFillType(fill, 'none'), 'solid')).toEqual(fill)
    const stroke = source.layers[0].style!.stroke!
    expect(withStrokeType(stroke, 'none')).toEqual({ ...stroke, type: 'none' })
    expect(strokeType(withStrokeType(stroke, 'none'))).toBe('none')
    expect(strokeType({ ...stroke, gradient: fill.gradient })).toBe('gradient')
    expect(source.timelines[0].tracks[0].keyframes[0].id).toBe('human')
  })
  it('imports an asset+paint in one command without an extra layer and preserves intervening movement', () => {
    const source = fixture(); source.assets = []
    const expected = imagePaintTargetSignature(source, 'hero')
    const moved = { ...source, layers: [{ ...source.layers[0], transform: { ...source.layers[0].transform, x: 40 } }] }
    const command = makeImportImagePaintCmd(asset, expected, 'hero'), after = command.execute(moved)
    expect(after.layers).toHaveLength(1); expect(after.assets).toEqual([asset])
    expect(after.layers[0].transform).toBe(moved.layers[0].transform)
    expect(after.layers[0].style!.stroke).toBe(source.layers[0].style!.stroke)
    expect(after.timelines).toBe(source.timelines)
    expect(command.undo(after)).toBe(moved)
    expect(command.execute(command.undo(after))).toEqual(after)
    const copied = makeDuplicateLayerCmd(after.layers[0], cloneSingleLayer(after.layers[0], { mode: 'copy' }).clonedLayer).execute(after)
    expect(copied.layers[1].style?.fill?.image?.assetId).toBe(asset.id)
    expect(parseSceneJson(JSON.stringify(after), true)).toEqual(after)
  })
  it('declines stale/deleted/locked paint targets before source adoption', () => {
    const source = fixture(), expected = imagePaintTargetSignature(source, 'hero')
    const command = makeImportImagePaintCmd(asset, expected, 'hero')
    const changed = { ...source, layers: [{ ...source.layers[0], style: { fill: { type: 'none' as const } } }] }
    expect(() => command.execute(changed)).toThrow('Paint changed')
    expect(() => command.execute({ ...source, layers: [] })).toThrow('editable Basic Shape')
    expect(() => command.execute({ ...source, layers: [{ ...source.layers[0], locked: true }] })).toThrow('editable Basic Shape')
  })
  it('keeps active/inactive image and composition assets out of orphan cleanup', () => {
    const source = fixture(); source.layers[0].style!.fill = { type: 'none', image }
    source.composition.backgroundFill = { type: 'image', image }
    const index = new AssetIndex(); index.build(source.layers, source.composition)
    expect(index.getLayerIds(asset.id)).toEqual(['hero']); expect(index.getRefCount(asset.id)).toBe(2)
    expect(index.isOrphan(asset.id)).toBe(false); expect(index.getUsage(asset.id).refCount).toBe(2)
    index.build([], source.composition); expect(index.getRefCount(asset.id)).toBe(1)
    index.clear(); expect(index.isOrphan(asset.id)).toBe(true)
  })
  it('validates new payloads without dropping legacy or unknown source data', () => {
    const source = fixture(); source.layers[0].style!.fill = { type: 'image', image }
    expect(() => assertScenePaint(source)).not.toThrow()
    for (const patch of [{ scale: -1 }, { version: 7 }, { offsetX: Infinity }, { fit: 'other' }]) {
      const bad = structuredClone(source); Object.assign(bad.layers[0].style!.fill!.image!, patch)
      expect(() => assertScenePaint(bad)).toThrow('Invalid image paint')
    }
    source.assets[0] = { ...asset, type: 'video' }
    expect(() => assertScenePaint(source)).toThrow('image asset'); expect(new RuntimeValidator().validate(source).errors.some(error => error.code === 'INVALID_PAINT')).toBe(true)
  })
  it('carries export visibility through SVG, HTML and runtime without modifying editor background', () => {
    const source = fixture(); source.composition.backgroundFill = { type: 'image', image }; source.composition.backgroundInExport = false
    const before = structuredClone(source)
    expect(compositionFill(source.composition).type).toBe('image')
    expect(compositionForOutput(source.composition).backgroundFill?.type).toBe('none')
    expect(exportSVG(source).svg).not.toContain('paintImage')
    expect(exportToRuntime(source).composition.backgroundFill?.type).toBe('none')
    expect(exportHTML(source).html).toContain('"backgroundColor":"transparent"')
    source.composition.backgroundInExport = true
    const svg = exportSVG(source).svg
    expect(svg).toContain('<pattern'); expect(svg).toContain(asset.url)
    expect(source.layers).toEqual(before.layers); expect(source.timelines).toEqual(before.timelines)
    source.layers[0].style!.fill = { type: 'image', image }
    source.timelines[0].tracks.push({ target: 'layers.hero.style.fill.image.offsetX', keyframes: [{ id: 'paint', timeMs: 0, value: 0, easing: { type: 'linear' } }] })
    expect(exportSVG(source, { animated: true }).warnings.join()).toContain('freezes image placement')
  })
})
