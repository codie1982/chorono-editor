import type { Asset, ChronoScene } from '../types'
import type { EditorCommand } from './commands-keyframe'
import { compositionFill, withFillType } from '../paint/paintSource'
import { makeUpdateLayerCmd } from './commands-layer'

/** One immutable paint identity captured before asynchronous import. Layer
 * movement/other source edits may continue; replacing this paint invalidates
 * adoption. The document signal is separately enforced by the import host. */
export function imagePaintTargetSignature(scene: ChronoScene, layerId?: string): string {
  const layer = layerId ? scene.layers.find(item => item.id === layerId) : undefined
  if (layerId && (!layer || layer.type !== 'shape' || layer.locked || layer.frozen)) throw new Error('Choose an editable Basic Shape before importing image paint.')
  return JSON.stringify(layer ? layer.style?.fill ?? null : compositionFill(scene.composition))
}

/** Adopt one already-probed asset and assign it without adding a stray image
 * layer. Current source is merged at commit; a stale/deleted/locked target fails
 * atomically. Source leases belong to the import host until synchronous dispatch
 * transfers them to document/history. Keys, transforms, stroke and inactive paint
 * remain untouched. One Undo/Redo owns both source registration and assignment. */
export function makeImportImagePaintCmd(asset: Asset, expected: string, layerId?: string): EditorCommand {
  let before: ChronoScene | undefined
  return { label: 'Import Image Paint', execute: scene => {
    if (asset.type !== 'image') throw new Error('Image paint requires a static image file.')
    if (imagePaintTargetSignature(scene, layerId) !== expected) throw new Error('Paint changed while importing. The current edit was preserved; choose the image again.')
    const collision = scene.assets.find(item => item.id === asset.id)
    if (collision && collision.url !== asset.url) throw new Error('Imported image asset ID conflicts with an existing source.')
    const layer = scene.layers.find(item => item.id === layerId)
    const fill = withFillType(layer ? layer.style?.fill : compositionFill(scene.composition), 'image')
    const nextFill = { ...fill, image: { ...fill.image!, assetId: asset.id } }
    const next = { ...scene, assets: collision ? scene.assets : [...scene.assets, asset] }
    const result = layer ? makeUpdateLayerCmd(layer.id, { style: { ...layer.style, fill: nextFill } }, layer).execute(next)
      : { ...next, composition: { ...scene.composition, backgroundFill: nextFill } }
    before = scene
    return result
  }, undo: scene => before ?? scene }
}
