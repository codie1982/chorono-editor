import { describe, expect, it } from 'vitest'
import { emptyScene, newImageLayer, newRectLayer } from '@/lib/defaults'
import { Mesh2DTopologyValidator } from '@/lib/geometry/mesh2d'
import { resolveMesh2DTexturePlacement } from '@/lib/mesh2d/Mesh2DTextureMapping'
import { resolveFitRect } from '@/lib/render/media/resolveFitRect'
import type { ChronoScene, Layer } from '@/lib/types'
import { VoronoiFractureGenerator } from '../VoronoiFractureGenerator'
import { FractureAppearanceCompiler } from '../FractureAppearanceCompiler'

describe('FractureAppearanceCompiler', () => {
  it('compiles image fragments as valid Mesh2D with source-rectangle UVs', () => {
    const { scene, source, generation } = imageFixture('cover')
    const compiler = new FractureAppearanceCompiler()
    const snapshot = compiler.snapshot(scene, source)
    const fragment = generation.fragments[0]
    const appearance = compiler.createFragmentAppearance(scene, source, generation, fragment, snapshot)

    expect(snapshot).toMatchObject({
      kind: 'image', assetId: 'poster', assetWidth: 400, assetHeight: 400, objectFit: 'cover',
    })
    expect(appearance.type).toBe('mesh2d')
    const mesh = appearance.mesh2d!
    expect(mesh.source).toMatchObject({
      kind: 'fractureFragment', sourceLayerId: 'poster-layer', generationId: 'poster-fracture',
      fragmentId: fragment.id, sourceAppearanceHash: snapshot.contentHash,
    })
    expect(mesh.geometry.textureReferenceBounds).toEqual({ x: 0, y: 0, width: 320, height: 180 })
    fragment.polygon.forEach((point, index) => {
      expect(mesh.geometry.uvs[index * 2]).toBeCloseTo(point.x / 320, 12)
      expect(mesh.geometry.uvs[index * 2 + 1]).toBeCloseTo(point.y / 180, 12)
    })
    expect(new Mesh2DTopologyValidator().validate(mesh.geometry).valid).toBe(true)
  })

  it('maps every fragment vertex to the same cover-fitted source pixel as the original image', () => {
    const { scene, source, generation } = imageFixture('cover')
    const compiler = new FractureAppearanceCompiler()
    const snapshot = compiler.snapshot(scene, source)
    const fragment = generation.fragments[0]
    const mesh = compiler.createFragmentAppearance(scene, source, generation, fragment, snapshot).mesh2d!
    const placement = resolveMesh2DTexturePlacement(
      mesh.geometry,
      snapshot.kind === 'image' ? snapshot.assetWidth : 0,
      snapshot.kind === 'image' ? snapshot.assetHeight : 0,
      mesh.appearance?.textureTransform,
    )!
    const fitted = resolveFitRect('cover', 320, 180, 400, 400)!

    fragment.polygon.forEach(point => {
      const sourcePoint = placement.localToSource.applyToPoint(point)
      expect(sourcePoint.x).toBeCloseTo((point.x - fitted.dx) * 400 / fitted.dw, 9)
      expect(sourcePoint.y).toBeCloseTo((point.y - fitted.dy) * 400 / fitted.dh, 9)
    })
  })

  it('keeps solid rectangle fragments as detached editable paths', () => {
    const base = emptyScene()
    const source: Layer = {
      ...newRectLayer(), id: 'solid', size: { width: 100, height: 80 },
      style: { fill: { type: 'solid', color: '#2563EB' }, cornerRadius: 0 },
    }
    const scene: ChronoScene = { ...base, layers: [source] }
    const generation = generate(source, 'solid-fracture')
    const compiler = new FractureAppearanceCompiler()
    const snapshot = compiler.snapshot(scene, source)
    const appearance = compiler.createFragmentAppearance(scene, source, generation, generation.fragments[0], snapshot)

    expect(snapshot.kind).toBe('solid')
    expect(appearance.type).toBe('path')
    expect(appearance.path?.anchors.length).toBe(generation.fragments[0].polygon.length)
    expect(appearance.style).toEqual(source.style)
    expect(appearance.style).not.toBe(source.style)
  })

  it('invalidates prepared image appearance after fit or asset metadata changes', () => {
    const { scene, source, generation } = imageFixture('contain')
    const compiler = new FractureAppearanceCompiler()
    const snapshot = compiler.snapshot(scene, source)
    const changed: ChronoScene = {
      ...scene,
      layers: scene.layers.map(layer => layer.id === source.id
        ? { ...layer, image: { ...layer.image!, objectFit: 'cover' } }
        : layer),
    }
    expect(() => compiler.createFragmentAppearance(
      changed,
      changed.layers[0],
      generation,
      generation.fragments[0],
      snapshot,
    )).toThrow(/appearance changed/)
    expect(() => compiler.snapshot({ ...scene, assets: [{ ...scene.assets[0], width: undefined }] }, source))
      .toThrow(/width and height metadata/)
  })
})

function imageFixture(objectFit: 'fill' | 'contain' | 'cover' | 'none') {
  const base = emptyScene()
  const source: Layer = {
    ...newImageLayer('poster', 320, 180),
    id: 'poster-layer',
    name: 'Poster',
    image: { assetId: 'poster', objectFit },
  }
  const scene: ChronoScene = {
    ...base,
    layers: [source],
    assets: [{ id: 'poster', name: 'Poster.png', type: 'image', url: 'embedded:poster', width: 400, height: 400 }],
  }
  return { scene, source, generation: generate(source, 'poster-fracture') }
}

function generate(source: Layer, generationId: string) {
  return new VoronoiFractureGenerator().generate({
    generationId,
    sourceOwnerId: source.id,
    sourcePolygon: [
      { x: 0, y: 0 }, { x: source.size!.width, y: 0 },
      { x: source.size!.width, y: source.size!.height }, { x: 0, y: source.size!.height },
    ],
    fragmentCount: 4,
    seed: 20261121,
  })
}
