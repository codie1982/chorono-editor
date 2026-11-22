import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, cloneLayerForDuplicate, newTimeline } from '../defaults'
import type { ChronoScene, Layer } from '../types'
import { prepareGeometryConversion, makeGeometryConversionStackCmd } from './commands-geometry-conversion'
import { makeRemoveModifierCmd, makeSetModifierSourceCmd } from './modifiers/commands'
import { makeUpdateLayerCmd } from './commands-layer'
import { GeometryConversionService } from '../geometry/conversion/GeometryConversionService'
import type { GeometryConversionData } from '../types/geometryConversion'
import { modifierStackService } from '../modifiers'
import { containsMesh2DPoint } from '../geometry/mesh2d/Mesh2DGeometryQueries'
import { splineToPathDefinition } from '../spline/splineToPath'
import { resolveLayerWorldMatrix } from '../geometry/resolveLayerWorldMatrix'
import { parseSceneJson } from '../format/scene/SceneJsonConverter'
import { defaultRuntimeSceneCompiler } from '../export/runtime/RuntimeSceneCompiler'
import { resolveInstanceLayer } from '../clone/InstanceResolver'
import { newGroupLayer } from '../registry/definitions/scene/GroupDefinition'

/** Source-local rectangle fixture with explicit IDs/placement. */
function rect(id: string, x = 0, y = 0, width = 100, height = 100): Layer {
  const layer = newRectLayer()
  return { ...layer, id, size: { width, height }, style: { ...layer.style, cornerRadius: 0 }, transform: { ...layer.transform, x, y, anchorX: 0, anchorY: 0 } }
}
/** Exercise the native immutable command, not just the converter. */
function convert(layers: Layer[], target: 'spline' | 'mesh2d' = 'spline') {
  const scene = { ...emptyScene(), layers }
  const plan = prepareGeometryConversion(scene, layers.map(layer => layer.id), target)
  const result = plan.command.execute(scene)
  return { scene, plan, result, layer: result.layers[0] }
}

describe('geometry conversion command', () => {
  it('preserves rounded cubic controls, placement, source data and exact Undo/Redo', () => {
    const source = rect('a', 42, 31, 100, 80)
    source.style = { ...source.style, cornerRadius: 12 }
    const { scene, plan, result, layer } = convert([source])
    expect(layer.type).toBe('spline')
    expect(Object.values(layer.spline!.segments).filter(segment => segment.type === 'cubic')).toHaveLength(4)
    expect(layer.transform).toEqual(source.transform)
    expect(layer.style?.cornerRadius).toBeUndefined()
    expect(layer.modifierStack?.source).toMatchObject({ kind: 'shape', sources: [{ cornerRadius: 12 }] })
    expect(Object.values(layer.spline!.subShapes).every(sub => sub.editable)).toBe(true)
    expect(plan.command.undo(result)).toBe(scene)
    expect(plan.command.execute(scene)).toBe(result)
    expect(source.type).toBe('shape')
  })

  it('unites intersecting rectangles without filling their concave missing region', () => {
    const { layer } = convert([rect('a', 0, 0, 100, 40), rect('b', 0, 20, 40, 100)], 'mesh2d')
    expect(containsMesh2DPoint(layer.mesh2d!.geometry, 20, 90)).toBe(true)
    expect(containsMesh2DPoint(layer.mesh2d!.geometry, 90, 90)).toBe(false)
    expect(layer.mesh2d!.boundaryRings).toHaveLength(1)
    expect(layer.modifierStack!.modifiers.map(stage => stage.type)).toEqual(['convertSpline', 'convertMesh2d'])
  })

  it.each(['spline', 'mesh2d'] as const)('keeps enclosed holes and separate islands for %s', target => {
    const layers = [rect('top', 0, 0, 120, 20), rect('bottom', 0, 100, 120, 20),
      rect('left', 0, 20, 20, 80), rect('right', 100, 20, 20, 80), rect('island', 180, 0, 20, 20)]
    const { layer, result } = convert(layers, target)
    expect(result.layers).toHaveLength(1)
    if (target === 'spline') {
      expect(Object.values(layer.spline!.contours)).toHaveLength(3)
      expect(Object.values(layer.spline!.subShapes).map(sub => sub.contourIds.length).sort()).toEqual([1, 2])
    } else {
      const mesh = layer.mesh2d!.geometry
      expect(containsMesh2DPoint(mesh, 60, 60)).toBe(false)
      expect(containsMesh2DPoint(mesh, 10, 60)).toBe(true)
      expect(containsMesh2DPoint(mesh, 190, 10)).toBe(true)
      expect(containsMesh2DPoint(mesh, 150, 10)).toBe(false)
      expect(layer.mesh2d!.boundaryRings).toHaveLength(3)
      let area = 0
      const { positions: p, topology: { triangleIndices: t } } = mesh
      for (let i = 0; i < t.length; i += 3) {
        const a = t[i] * 2, b = t[i + 1] * 2, c = t[i + 2] * 2
        area += ((p[b] - p[a]) * (p[c + 1] - p[a + 1]) - (p[b + 1] - p[a + 1]) * (p[c] - p[a])) / 2
      }
      expect(area).toBeCloseTo(120 * 120 - 80 * 80 + 20 * 20)
    }
  })

  it('splits a full ring seam and permits a zero-radius filled disk', () => {
    for (const radius of [0, 25]) {
      const source = { ...rect('ring'), shapeKind: 'ring' as const, shapeParams: { kind: 'ring' as const, innerRadius: radius, startAngle: 0, endAngle: 360 } }
      const { layer } = convert([source], 'mesh2d')
      expect(containsMesh2DPoint(layer.mesh2d!.geometry, 50, 50)).toBe(radius === 0)
    }
  })

  it('keeps open primitives open for Spline and rejects filled-surface conversion', () => {
    const source = { ...rect('line'), shapeKind: 'line' as const, shapeParams: { kind: 'line' as const, x1: 0, y1: 0, x2: 100, y2: 30 } }
    const { layer } = convert([source])
    expect(splineToPathDefinition(layer.spline!).closed).toBe(false)
    expect(Object.values(layer.spline!.segments)).toHaveLength(1)
    expect(() => convert([source], 'mesh2d')).toThrow(/closed/)
  })

  it('retains custom anchors under reflected, rotated and scaled parents', () => {
    const parent = newGroupLayer()
    parent.transform = { ...parent.transform, x: 120, y: 32, rotationDeg: 22, scaleX: -1.4, scaleY: .8 }
    const source = { ...rect('a', 27, 49), parentId: parent.id }
    source.transform = { ...source.transform, rotationDeg: -31, anchorX: 13, anchorY: 24 }
    const scene = { ...emptyScene(), layers: [parent, source] }
    const before = resolveLayerWorldMatrix(source, scene, 0, new Map())
    const plan = prepareGeometryConversion(scene, ['a'], 'spline'), result = plan.command.execute(scene)
    expect(resolveLayerWorldMatrix(result.layers[1], result, 0, new Map())).toEqual(before)
    expect(result.layers[1].spline!.points['shape-point-0-0']).toMatchObject({ x: 0, y: 0 })
  })

  it('preserves edited spline points through Mesh conversion and modifier removal', () => {
    const first = convert([rect('a')])
    const spline = first.layer.spline!, point = Object.keys(spline.points)[0]
    const scene = makeUpdateLayerCmd('a', { spline: { ...spline, points: { ...spline.points, [point]: { ...spline.points[point], x: 10 } } } }, first.layer).execute(first.result)
    const next = prepareGeometryConversion(scene, ['a'], 'mesh2d').command.execute(scene)
    const recipe = next.layers[0].modifierStack!
    const restored = makeRemoveModifierCmd(next, 'a', recipe.modifiers.at(-1)!.id).execute(next)
    expect(restored.layers[0].spline!.points[point].x).toBe(10)
    const basic = makeRemoveModifierCmd(restored, 'a', recipe.modifiers[0].id).execute(restored)
    expect(basic.layers[0].type).toBe('shape')
    expect(basic.layers[0].geometryConversion).toBeUndefined()
  })

  it('supports explicit source rebuilding and invalidates pinned/deformed topology', () => {
    const { result, layer } = convert([rect('a')], 'mesh2d')
    const source = layer.modifierStack!.source
    if (source.kind !== 'shape') throw new Error('Expected captured Basic Shape.')
    const modified = { ...source, sources: [{ ...source.sources[0], size: { width: 200, height: 100 } }] }
    const rebuilt = makeSetModifierSourceCmd(result, 'a', modified).execute(result)
    expect(containsMesh2DPoint(rebuilt.layers[0].mesh2d!.geometry, 180, 50)).toBe(true)
    const pinned = { ...result, layers: [{ ...layer, mesh2d: { ...layer.mesh2d!, pins: { schemaVersion: 1 as const, topologyHash: layer.mesh2d!.geometry.topology.topologyHash, vertexIds: [layer.mesh2d!.geometry.topology.vertexIds[0]] } } }] }
    expect(() => makeSetModifierSourceCmd(pinned, 'a', modified)).toThrow(/pins/)
  })

  it('round-trips recipes portably, copies independently and emits ordinary runtime geometry', () => {
    const { result, layer } = convert([rect('a')], 'mesh2d')
    const loaded = parseSceneJson(JSON.stringify(result), true)
    expect(loaded.layers[0]).toEqual(layer)
    const cloned = cloneLayerForDuplicate(layer)
    expect(cloned.modifierStack).toEqual(layer.modifierStack)
    expect(cloned.modifierStack).not.toBe(layer.modifierStack)
    expect(cloned.mesh2d!.source).toMatchObject({ sourceLayerId: cloned.id })
    const instance = resolveInstanceLayer({ ...rect('instance'), instanceOf: layer.id }, result.layers)!
    expect(instance.type).toBe('mesh2d')
    expect(instance.modifierStack).toEqual(layer.modifierStack)
    const runtime = defaultRuntimeSceneCompiler.compile(loaded)
    expect(runtime.layers[0].geometryConversion).toBeUndefined()
    expect(runtime.layers[0].modifierStack).toBeUndefined()
    expect(runtime.layers[0].mesh2d!.boundaryRings).toEqual(layer.mesh2d!.boundaryRings)
  })

  it('rejects stale commands and external secondary readers without touching source', () => {
    const a = rect('a'), b = rect('b', 40), scene = { ...emptyScene(), layers: [a, b] }
    const plan = prepareGeometryConversion(scene, ['a', 'b'], 'spline')
    expect(() => plan.command.execute({ ...scene, layers: [...scene.layers] })).toThrow(/changed/)
    const reader = { ...rect('reader'), instanceOf: b.id }
    expect(() => prepareGeometryConversion({ ...scene, layers: [...scene.layers, reader] }, ['a', 'b'], 'spline')).toThrow(/readers/)
  })

  it('keeps transform/paint tracks and refuses geometry writers or unsafe ordering', () => {
    const a = rect('a'), timeline = newTimeline()
    timeline.tracks = [{ target: 'layers.a.transform.x', keyframes: [] }]
    const scene: ChronoScene = { ...emptyScene(), layers: [a], timelines: [timeline] }
    const converted = prepareGeometryConversion(scene, ['a'], 'spline').command.execute(scene)
    expect(converted.timelines[0].tracks).toBe(timeline.tracks)
    const driven = { ...scene, timelines: [{ ...timeline, tracks: [{ ...timeline.tracks[0], target: 'layers.a.size.width' }] }] }
    expect(() => prepareGeometryConversion(driven, ['a'], 'spline')).toThrow(/animation or live drivers/)
    const order = { ...emptyScene(), layers: [a, rect('unrelated', 250), rect('b', 40)] }
    expect(() => prepareGeometryConversion(order, ['a', 'b'], 'spline')).toThrow(/contiguous/)
  })

  it('preserves legacy conversion-v1 source/edits on migration and old command access', () => {
    const original = rect('a'), recipe: GeometryConversionData = { version: 1, sources: [{ type: 'shape', name: 'a', shape: 'rect', size: { width: 100, height: 100 }, cornerRadius: 0, matrix: [1, 0, 0, 1, 0, 0] }], unionTolerancePx: .25,
      stages: [{ id: 'old-convert', kind: 'convertSpline' }] }
    const legacy = new GeometryConversionService().apply(original, recipe), scene = { ...emptyScene(), layers: [legacy] }
    expect(parseSceneJson(JSON.stringify(scene), true).layers[0].geometryConversion).toEqual(recipe)
    const stack = modifierStackService.stackFor(legacy)
    expect(stack.modifiers[0]).toMatchObject({ id: 'old-convert', type: 'convertSpline', settings: { edited: legacy.spline } })
    const restored = makeGeometryConversionStackCmd(scene, 'a', { ...recipe, stages: [] }).execute(scene)
    expect(restored.layers[0].type).toBe('shape')
    const migrated = prepareGeometryConversion(scene, ['a'], 'mesh2d').command.execute(scene)
    expect(migrated.layers[0].geometryConversion).toBeUndefined()
    expect(migrated.layers[0].modifierStack!.modifiers.map(item => item.type)).toEqual(['convertSpline', 'convertMesh2d'])
    expect(migrated.layers[0].modifierStack!.source).toEqual(stack.source)
  })

  it('rejects malformed saved stage order rather than accepting a misleading list', () => {
    const { result } = convert([rect('a')])
    const invalid = structuredClone(result)
    invalid.layers[0].modifierStack = { ...invalid.layers[0].modifierStack!, modifiers: [{ id: 'mesh', type: 'convertMesh2d', version: 1, enabled: true, settings: { tolerancePx: .25 } }] }
    expect(() => parseSceneJson(JSON.stringify(invalid), true)).toThrow(/requires spline/i)
  })
})
