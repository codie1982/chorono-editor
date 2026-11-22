import { describe, expect, it } from 'vitest'
import { emptyScene, newSplineLayerFromPrimitive, newRectLayer } from '../../defaults'
import { PlanarOutlineBackend } from '../../spline/outline'
import { chamferSpline } from '../../spline/chamfer'
import { filletSpline } from '../../spline/fillet'
import { PolygonClippingBackend } from '../../geometry/boolean'
import { getCapabilities, validateToolCall } from '../catalog'
import { fakeEditor } from './support/fakeEditor'
import type { SplineOperation } from '../../editor/spline/operations/types'

/** Platform injection for Node tests only; browser acceptance uses real workers.
 * Real domain solvers and native commands still run through broker/editor pump. */
export const headlessSplineExecutors = () => ({
  outline: { execute: async (request: Parameters<PlanarOutlineBackend['compute']>[0]) => new PlanarOutlineBackend().compute(request) },
  chamfer: { execute: async (request: Parameters<typeof chamferSpline>[0]) => chamferSpline(request) },
  fillet: { execute: async (request: Parameters<typeof filletSpline>[0]) => filletSpline(request) },
  boolean: { execute: async (request: Parameters<PolygonClippingBackend['compute']>[0]) => new PolygonClippingBackend().compute(request) },
})
function setup() {
  const editor = fakeEditor(), scene = emptyScene(), layer = newSplineLayerFromPrimitive('rectangle', { width: 150, height: 120 })!
  scene.layers = [layer]; scene.timelines = [{ id: 'human', durationMs: 1000, autoplay: false, loop: false, tracks: [{ target: `layers.${layer.id}.opacity`, keyframes: [{ id: 'human-key', timeMs: 0, value: .8, easing: { type: 'easeOut' } }] }] }]
  editor.replaceDocument(scene); editor.host.splineExecutors = headlessSplineExecutors()
  return { editor, scene, layer }
}
async function prepare(editor: ReturnType<typeof fakeEditor>, layerId: string | undefined, operation: SplineOperation) {
  const source = await editor.rawCall('get_scene')
  return editor.rawCall('prepare_spline_edit', { layerId, operation, previewWidth: 0, expectedRevision: source.revision, readToken: source.readToken })
}
const access = (plan: any) => ({ planId: plan.planId, expectedRevision: plan.revision, readToken: plan.readToken })

describe('native spline MCP plans and source ownership', () => {
  it.each(['chamfer', 'fillet', 'offset'] as const)('prepares/applies %s once, keeps manual keys and exact IDs, restores through one Undo/Redo', async kind => {
    const { editor, scene, layer } = setup()
    try {
      const points = Object.keys(layer.spline!.points).slice(0, 2), objects = Object.keys(layer.spline!.subShapes)
      const operation: SplineOperation = kind === 'offset' ? { kind, selection: { mode: 'object', ids: objects }, settings: { distancePx: 10, side: 'inside', join: 'round', miterLimit: 4, tolerancePx: .25 } }
        : kind === 'chamfer' ? { kind, pointIds: points, distancePx: 10 } : { kind, pointIds: points, radiusPx: 10 }
      const plan = await prepare(editor, layer.id, operation)
      expect(editor.host.editor.getScene()).toEqual(scene); expect(editor.historyLength()).toBe(0); expect(plan.scene).toBeUndefined(); expect(plan.data).toBeUndefined()
      const applied = await editor.rawCall('apply_spline_edit', { ...access(plan), requestId: 'once' }), after = structuredClone(editor.host.editor.getScene())
      expect(applied.result.ids).toEqual(plan.result.ids); expect(editor.historyLength()).toBe(1); expect(after.timelines).toEqual(scene.timelines)
      expect(await editor.rawCall('apply_spline_edit', { ...access(plan), requestId: 'once' })).toEqual(applied)
      await editor.call('undo'); expect(editor.host.editor.getScene()).toEqual(scene)
      await editor.call('redo'); expect(editor.host.editor.getScene()).toEqual(after)
    } finally { await editor.close() }
  })
  it('discards without source/history writes and rejects stale/foreign/incorrect-kind plans and missing read authority', async () => {
    const { editor, scene, layer } = setup()
    try {
      const operation: SplineOperation = { kind: 'movePoint', pointId: Object.keys(layer.spline!.points)[0], x: -50, y: -40 }
      await expect(editor.rawCall('prepare_spline_edit', { layerId: layer.id, operation, previewWidth: 0 })).rejects.toMatchObject({ code: 'EXPECTED_REVISION_REQUIRED' })
      const plan = await prepare(editor, layer.id, operation), other = editor.createClient('Other agent')
      await expect(other.rawCall('discard_spline_edit', { planId: plan.planId })).rejects.toThrow('another client')
      await expect(editor.rawCall('apply_script_plan', access(plan))).rejects.toThrow('matching script/spline')
      expect(await editor.rawCall('discard_spline_edit', { planId: plan.planId })).toEqual({ discarded: true })
      expect(await editor.rawCall('discard_spline_edit', { planId: plan.planId })).toEqual({ discarded: false })
      expect(editor.host.editor.getScene()).toEqual(scene); expect(editor.historyLength()).toBe(0)
      const stale = await prepare(editor, layer.id, operation)
      await editor.call('update_layer', { layerId: layer.id, name: 'Human rename' })
      await expect(editor.rawCall('apply_spline_edit', access(stale))).rejects.toMatchObject({ code: 'SOURCE_REVISION_CONFLICT' })
      expect(editor.host.editor.getScene().layers[0].name).toBe('Human rename')
    } finally { await editor.close() }
  })
  it('keeps coordinate-key owners and removed-ID references unchanged on rejection', async () => {
    const { editor, scene, layer } = setup()
    try {
      const pointId = Object.keys(layer.spline!.points)[0]
      scene.timelines[0].tracks.push({ target: `layers.${layer.id}.spline.points.${pointId}.x`, keyframes: [{ id: 'manual-point', timeMs: 0, value: -75, easing: { type: 'linear' } }] })
      editor.replaceDocument(scene)
      await expect(prepare(editor, layer.id, { kind: 'chamfer', pointIds: [pointId], distancePx: 10 })).rejects.toThrow(/keyed|timeline/)
      expect(editor.host.editor.getScene()).toEqual(scene); expect(editor.historyLength()).toBe(0)
    } finally { await editor.close() }
  })
  it('uses explicit Continue/Auto Close and endpoint IDs; two lines connect as one contour without duplicated endpoints', async () => {
    const { editor, scene, layer } = setup()
    try {
      const line = newSplineLayerFromPrimitive('line', { x1: 0, y1: 0, x2: 100, y2: 0 })!
      scene.layers = [line]; scene.timelines = []; editor.replaceDocument(scene)
      const contour = Object.values(line.spline!.contours)[0], endpoint = contour.pointIds.at(-1)!
      const plan = await prepare(editor, line.id, { kind: 'draw', startPointId: endpoint, points: [{ x: 100, y: 80 }], autoClose: true })
      await editor.rawCall('apply_spline_edit', access(plan))
      const data = editor.host.editor.getScene().layers[0].spline!
      expect(Object.keys(data.points)).toHaveLength(3); expect(data.contours[contour.id].closed).toBe(true)
      expect(data.points[endpoint]).toEqual(line.spline!.points[endpoint])
      await editor.call('undo'); expect(editor.host.editor.getScene()).toEqual(scene)
    } finally { await editor.close() }
  })
  it('persists editable Boolean sources and re-edits the same recipe owner', async () => {
    const { editor, scene } = setup()
    try {
      const a = newRectLayer(), b = newRectLayer(); b.transform.x = 50; scene.layers = [a, b]; scene.timelines = []; editor.replaceDocument(scene)
      const plan = await prepare(editor, undefined, { kind: 'boolean', targets: [{ layerId: a.id }, { layerId: b.id }], settings: { operation: 'union', reverse: false, tolerancePx: .25 } })
      await editor.rawCall('apply_spline_edit', access(plan)); const ownerId = plan.result.ownerId
      expect(editor.host.editor.getScene().layers.find(l => l.id === ownerId)?.booleanOperation?.operation).toBe('union')
      const edit = await prepare(editor, undefined, { kind: 'boolean', ownerId, settings: { operation: 'subtract', reverse: false, tolerancePx: .25 } })
      await editor.rawCall('apply_spline_edit', access(edit))
      expect(editor.host.editor.getScene().layers.find(l => l.id === ownerId)?.booleanOperation?.operation).toBe('subtract')
      expect(editor.host.editor.getScene().layers.filter(l => l.booleanOperation)).toHaveLength(1)
      expect(editor.host.editor.getScene().layers.find(l => l.id === a.id)?.shape).toEqual(a.shape)
      await editor.call('undo'); expect(editor.host.editor.getScene().layers.find(l => l.id === ownerId)?.booleanOperation?.operation).toBe('union')
    } finally { await editor.close() }
  })
  it('advertises one coherent workflow and validates kinds, modes, algorithm limits and paint units', async () => {
    expect((await getCapabilities('standard', { summary: true }) as any).splineEditing).toMatchObject({ version: 1, prepareTool: 'prepare_spline_edit', scriptSynchronous: true })
    const auth = { expectedRevision: 0, readToken: 'a'.repeat(64) }
    await expect(validateToolCall('prepare_spline_edit', { operation: { kind: 'fillet', pointIds: ['p'], radiusPx: 10 }, ...auth })).rejects.toThrow('layerId')
    await expect(validateToolCall('prepare_spline_edit', { layerId: 'l', operation: { kind: 'topology', selection: { mode: 'edge', ids: ['s'] }, action: { kind: 'divide', parts: 65 } }, ...auth })).rejects.toThrow()
    await expect(validateToolCall('prepare_spline_edit', { layerId: 'l', operation: { kind: 'paint', fill: { type: 'none' } }, ...auth })).resolves.toBeDefined()
    await expect(validateToolCall('prepare_spline_edit', { layerId: 'l', operation: { kind: 'paint', fill: { type: 'solid', opacity: 101 } }, ...auth })).rejects.toThrow()
    await expect(validateToolCall('prepare_spline_edit', { layerId: 'l', operation: { kind: 'paint', fill: { type: 'image', image: { version: 1, assetId: 'image', fit: 'stretch' } } }, ...auth })).rejects.toThrow()
  })
  it('preserves native Detach copy attribution and outer animation through prepared Apply', async () => {
    const { editor, scene, layer } = setup()
    try {
      // Establish real human provenance before the agent copies source content.
      await editor.call('update_layer', { layerId: layer.id, name: 'Owned source' })
      const current = editor.host.editor.getScene(), objects = Object.keys(layer.spline!.subShapes)
      const plan = await prepare(editor, layer.id, { kind: 'detach', objectIds: objects })
      expect(plan.authoringHints).toBeUndefined()
      await editor.rawCall('apply_spline_edit', access(plan))
      const after = editor.host.editor.getScene(), copied = after.layers.find(l => l.id === plan.result.layerId)!
      expect(copied.parentId).toEqual(layer.parentId); expect(copied.transform).toEqual(layer.transform)
      expect(after.timelines[0].tracks.some(t => t.target === `layers.${copied.id}.opacity`)).toBe(true)
      const ledger = Object.values(after.authoring!.records).find(r => r.address[0] === 'layer' && r.address[1] === copied.id)
      expect(ledger?.inheritedFrom).toEqual(['layer', layer.id])
      await editor.call('undo'); expect(editor.host.editor.getScene()).toEqual(current)
    } finally { await editor.close() }
  })
  it('refuses active transactions and replaced documents even when the revision number is reused', async () => {
    const { editor, scene, layer } = setup()
    try {
      const operation: SplineOperation = { kind: 'movePoint', pointId: Object.keys(layer.spline!.points)[0], x: 0, y: 0 }
      const plan = await prepare(editor, layer.id, operation)
      editor.setTransactionActive(true)
      await expect(editor.rawCall('apply_spline_edit', access(plan))).rejects.toMatchObject({ code: 'SOURCE_EDITOR_BUSY' })
      editor.setTransactionActive(false)
      editor.replaceDocument(structuredClone(scene), 0)
      await expect(editor.rawCall('apply_spline_edit', access(plan))).rejects.toMatchObject({ code: 'SOURCE_DOCUMENT_CHANGED' })
      expect(editor.host.editor.getScene()).toEqual(scene); expect(editor.historyLength()).toBe(0)
    } finally { await editor.close() }
  })
})
