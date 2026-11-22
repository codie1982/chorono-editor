import type { ChronoScene, ShapeFill } from '../types'

/** Validate the new serializable paint payload, including inactive values.
 * Missing assets remain diagnosable source references; an existing non-image
 * asset cannot masquerade as image paint. Legacy color/gradient fields and
 * extension payloads are untouched. No native decode/URL ownership is acquired. */
export function assertScenePaint(scene: ChronoScene): void {
  const assets = new Map(scene.assets.map(asset => [asset.id, asset]))
  const check = (fill: ShapeFill | undefined) => {
    if (!fill) return
    if (fill.type === 'image' && !fill.image) throw new Error('Image paint requires its versioned placement payload.')
    const image = fill.image
    if (!image) return
    if (image.version !== 1 || typeof image.assetId !== 'string' || image.fit !== undefined && !['cover', 'contain', 'fill'].includes(image.fit)
      || ![image.offsetX ?? 0, image.offsetY ?? 0, image.scale ?? 1, image.rotationDeg ?? 0].every(Number.isFinite) || (image.scale ?? 1) <= 0) throw new Error('Invalid image paint placement.')
    if (image.assetId && assets.has(image.assetId) && assets.get(image.assetId)!.type !== 'image') throw new Error('Image paint must reference an image asset.')
  }
  check(scene.composition.backgroundFill)
  if (scene.composition.backgroundInExport !== undefined && typeof scene.composition.backgroundInExport !== 'boolean') throw new Error('Invalid background export visibility.')
  for (const layer of scene.layers) {
    check(layer.style?.fill)
    if (layer.style?.stroke?.type !== undefined && !['solid', 'gradient', 'none'].includes(layer.style.stroke.type)) throw new Error('Invalid stroke paint type.')
  }
}
