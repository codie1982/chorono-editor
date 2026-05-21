// ── add_layer repeater + media build tests ────────────────────────────────────
import { describe, it, expect, beforeEach } from 'vitest'
import { buildLayerFromParams, registerLayerActions } from '../layer'
import { ActionRegistry } from '../../ActionRegistry'
import { emptyScene } from '@/lib/defaults'
import type { ChronoScene, Asset } from '@/lib/types'

describe('buildLayerFromParams — repeater', () => {
  it('builds a linear repeater with a transform step', () => {
    const layer = buildLayerFromParams({
      id: 'rep1', name: 'Row', type: 'repeater',
      sourceLayerId: 'card', count: 5, repeaterMode: 'linear',
      stepX: 120, stepOpacity: -0.1,
    })
    expect(layer.type).toBe('repeater')
    expect(layer.repeater?.sourceLayerId).toBe('card')
    expect(layer.repeater?.count).toBe(5)
    expect(layer.repeater?.mode).toBe('linear')
    expect(layer.repeater?.transformStep).toEqual({ x: 120, opacity: -0.1 })
    expect(layer.repeater?.polar).toBeUndefined()
  })

  it('builds a polar repeater with ring params', () => {
    const layer = buildLayerFromParams({
      id: 'rep2', name: 'Ring', type: 'repeater',
      sourceLayerId: 'dot', count: 8, repeaterMode: 'polar',
      polarRadius: 150, polarStartAngle: 0, polarEndAngle: 360,
    })
    expect(layer.repeater?.mode).toBe('polar')
    expect(layer.repeater?.polar).toEqual({ radius: 150, startAngle: 0, endAngle: 360 })
  })

  it('defaults count to 3 and mode to linear', () => {
    const layer = buildLayerFromParams({
      id: 'rep3', name: 'R', type: 'repeater', sourceLayerId: 'x',
    })
    expect(layer.repeater?.count).toBe(3)
    expect(layer.repeater?.mode).toBe('linear')
  })
})

describe('buildLayerFromParams — media', () => {
  it('builds an image layer with assetId + objectFit', () => {
    const layer = buildLayerFromParams({
      id: 'img1', name: 'Hero', type: 'image', assetId: 'a1', objectFit: 'cover',
    })
    expect(layer.type).toBe('image')
    expect(layer.image).toEqual({ assetId: 'a1', objectFit: 'cover' })
  })

  it('builds a video layer with media props', () => {
    const layer = buildLayerFromParams({
      id: 'v1', name: 'Clip', type: 'video', assetId: 'a2', volume: 0.5, loop: true,
    })
    expect(layer.video).toMatchObject({ assetId: 'a2', volume: 0.5, loop: true })
  })
})

describe('add_layer media validation', () => {
  let reg: ActionRegistry
  let scene: ChronoScene
  beforeEach(() => {
    reg = new ActionRegistry()
    registerLayerActions(reg)
    scene = emptyScene()
    scene.assets = [{ id: 'a1', name: 'Hero', type: 'image', url: 'blob://x' } as Asset]
  })

  function add(params: Record<string, unknown>) {
    return reg.get('add_layer')!.toCommand!(params, scene)!
  }

  it('errors when media assetId is missing', () => {
    expect(add({ id: 'x', name: 'X', type: 'image' }).label).toMatch(/requires assetId/)
  })

  it('errors when asset id does not exist', () => {
    expect(add({ id: 'x', name: 'X', type: 'image', assetId: 'ghost' }).label).toMatch(/not found/)
  })

  it('errors when asset type mismatches layer type', () => {
    expect(add({ id: 'x', name: 'X', type: 'video', assetId: 'a1' }).label).toMatch(/is a image, not video/)
  })

  it('accepts a valid image asset reference', () => {
    const next = add({ id: 'x', name: 'X', type: 'image', assetId: 'a1' }).execute(scene)
    expect(next.layers[0].image?.assetId).toBe('a1')
  })
})
