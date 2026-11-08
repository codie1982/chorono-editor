import { emptyScene, newRectLayer } from '@/lib/defaults'
import type { ChronoScene, Layer } from '@/lib/types'
import { CanvasRenderer, canvasRenderer, type CanvasRenderOptions } from '../../CanvasRenderer'
import { StaticGroupLodCache, staticGroupLodCache } from '../StaticGroupLodCache'
import { compareLodPixels } from '@/lib/resources/benchmark/__tests__/compareLodPixels'
import { CanvasSurfacePool } from '../../resources/CanvasSurfacePool'
import { ResourceBudget } from '@/lib/resources/budget'
import { acquireRasterImage } from '@/lib/export/raster/RasterExportEngine'
import { acquireSequence } from '@/lib/export/sequence/SequenceExportEngine'
import { ZipReader } from '@/lib/import/zip/ZipReader'

/** Disposable native software regression fixture. Includes overlapping partial
 * alpha, curved edges, negative local origin and a center-aligned stroke. */
function fixture(): ChronoScene {
  const group: Layer = { ...newRectLayer(), id: 'group', type: 'group', opacity: 1,
    transform: { x: 20, y: 20, anchorX: 0, anchorY: 0, rotationDeg: 0, scaleX: 1, scaleY: 1 } }
  const children = Array.from({ length: 16 }, (_, i): Layer => ({ ...newRectLayer(), id: `c${i}`, parentId: group.id,
    opacity: i % 3 ? 1 : 0.65, size: { width: 34, height: 28 }, shapeKind: i % 2 ? 'ellipse' : 'rect',
    transform: { ...group.transform, x: -8 + (i % 4) * 32, y: Math.floor(i / 4) * 23 },
    style: { fill: { type: 'solid', color: i % 2 ? '#42a8d7' : '#ed7844', opacity: 90 },
      stroke: { color: '#eef7ff', width: 2, alignment: 'center' } } }))
  return { ...emptyScene(), layers: [group, ...children], composition: { ...emptyScene().composition,
    width: 192, height: 144, durationMs: 1000, backgroundColor: '#253447' } }
}

/** Native pixel/ownership/counter acceptance; never a production application route. */
async function check() {
  document.body.innerHTML = '<style>body{font:14px system-ui;margin:24px;background:#17212b;color:#eff6ff}pre{white-space:pre-wrap}canvas{width:384px;border:1px solid #64748b;margin:12px}</style><h1>Static group LOD — native regression</h1><p id="status">Running</p><div id="examples"></div><pre id="report"></pre>'
  const budget = new ResourceBudget({ maxBytes: 2 * 1024 * 1024 })
  const cache = new StaticGroupLodCache({ maxBytes: 1024 * 1024, maxIdleMs: 2000, budget })
  const scratch = new CanvasSurfacePool({ maxBytes: 1024 * 1024, budget })
  const renderer = new CanvasRenderer(scratch, cache), scene = fixture()
  const results: Array<Record<string, unknown>> = []
  let passed = true
  function draw(lod = true, options: CanvasRenderOptions = {}, activeScene = scene) {
    const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 144
    renderer.render(canvas.getContext('2d')!, activeScene, 500, null, new Map(),
      { renderMode: 'preview', lod: lod ? { zoom: 0.5 } : undefined, ...options })
    return canvas
  }
  function test(name: string, success: boolean, details: Record<string, unknown> = {}) {
    results.push({ name, passed: success, ...details }); passed &&= success
  }
  function parity(name: string, options: CanvasRenderOptions = {}, activeScene = scene) {
    const reference = draw(false, options, activeScene), actual = draw(true, options, activeScene)
    const quality = compareLodPixels(reference, actual, 0.5)
    test(name, quality.previewWithinTolerance, { quality, counters: renderer.getLastPaintStatistics() })
    reference.width = reference.height = actual.width = actual.height = 0
  }
  const reference = draw(false), cold = draw(true), coldStats = renderer.getLastPaintStatistics()!
  test('cold admitted build represents descendants', coldStats.lodGroups === 1 && coldStats.lodBuilds === 1
    && coldStats.lodRepresented === 16 && coldStats.processed === 1, { counters: coldStats })
  const warm = draw(true), warmStats = renderer.getLastPaintStatistics()!
  test('warm cache avoids child traversal', warmStats.lodBuilds === 0 && warmStats.visits === 1
    && warmStats.lodRepresented === 16 && cache.getSnapshot().hits > 0, { counters: warmStats })
  const quality = compareLodPixels(reference, warm, 0.5)
  test('preview parity at half zoom', quality.previewWithinTolerance, { quality })
  document.querySelector('#examples')!.append(reference, warm)
  cold.width = cold.height = 0
  scene.layers[0].transform.x += 3.25; scene.layers[0].transform.rotationDeg = 17
  parity('static rotated/subpixel placement refreshes projected pixels')
  scene.layers[0].opacity = 0.5
  parity('outer partial alpha stays non-isolated live vectors')
  test('partial alpha proxy is bypassed', renderer.getLastPaintStatistics()!.lodGroups === 0)
  scene.layers[0].opacity = 1; scene.layers[0].transform.rotationDeg = 0
  draw(true, { renderMode: 'editor', selectedLayerIds: new Set(['c0']), selectionOutline: false }).width = 0
  test('selected descendant restores detailed drawing', renderer.getLastPaintStatistics()!.lodGroups === 0)
  draw(true).width = 0
  draw(true, { lod: { zoom: 0.75 } }).width = 0
  test('cached proxy persists in hysteresis band', renderer.getLastPaintStatistics()!.lodGroups === 1)
  draw(true, { lod: { zoom: 1 } }).width = 0
  test('near zoom releases proxy and restores details', renderer.getLastPaintStatistics()!.lodGroups === 0 && cache.size() === 0)
  draw(true).width = 0
  const allocations = cache.getSnapshot().allocations
  scene.layers[1].style!.fill!.color = '#28df74'
  parity('in-place edit invalidates exact content version')
  test('in-place edit actually rebuilt', cache.getSnapshot().allocations === allocations + 1)
  const animated = { ...scene, timelines: [{ id: 'animation', durationMs: 1000, autoplay: true, loop: false,
    tracks: [{ target: 'layers.c0.transform.x', keyframes: [{ id: 'a', timeMs: 0, value: 0, easing: { type: 'linear' as const } },
      { id: 'b', timeMs: 1000, value: 50, easing: { type: 'linear' as const } }] }] }] }
  parity('animated child is never frozen', {}, animated)
  test('animated child bypasses LOD', renderer.getLastPaintStatistics()!.lodGroups === 0)
  const effects = { ...scene, layers: scene.layers.map(l => l.id === 'group'
    ? { ...l, effects: { blur: 3 } } : l) }
  parity('group effect dependency uses live drawing', {}, effects)
  test('group effect bypasses LOD', renderer.getLastPaintStatistics()!.lodGroups === 0)
  const outside = { ...scene, layers: scene.layers.map(l => l.id === 'c1' ? { ...l, style: { ...l.style, stroke: { color: '#fff', width: 6, alignment: 'outside' as const } } } : l) }
  parity('backdrop-dependent outside stroke stays live', {}, outside)
  test('outside stroke bypasses proxy', renderer.getLastPaintStatistics()!.lodGroups === 0)
  const deniedCache = new StaticGroupLodCache({ maxBytes: 0, maxIdleMs: 0 })
  const deniedRenderer = new CanvasRenderer(scratch, deniedCache), deniedCanvas = document.createElement('canvas')
  deniedCanvas.width = 192; deniedCanvas.height = 144
  deniedRenderer.render(deniedCanvas.getContext('2d')!, scene, 500, null, new Map(), { renderMode: 'preview', lod: { zoom: 0.5 } })
  test('budget denial falls back before any allocation', deniedCache.getSnapshot().allocations === 0
    && deniedCache.getSnapshot().budgetDenials === 1 && deniedRenderer.getLastPaintStatistics()!.processed === 17)
  deniedCanvas.width = deniedCanvas.height = 0
  const exportA = draw(false), exportB = draw(false)
  const exportQuality = compareLodPixels(exportA, exportB, 1)
  test('export/default render is full-detail and deterministic', exportQuality.maxError === 0
    && renderer.getLastPaintStatistics()!.lodGroups === 0)
  exportA.width = exportA.height = exportB.width = exportB.height = 0
  // Exercise actual output APIs against the SAME global warmed viewport cache,
  // including content beyond a narrow viewport. Reference/decoded QA copies are
  // separate evidence buffers, not application output-resource accounting.
  const outputScene = fixture(), originalJson = JSON.stringify(outputScene)
  const outputReference = document.createElement('canvas')
  outputReference.width = 192; outputReference.height = 144
  const warmGlobal = () => canvasRenderer.render(outputReference.getContext('2d')!, outputScene, 500, null, new Map(),
    { renderMode: 'preview', lod: { zoom: .5 }, visibleArea: { x: 0, y: 0, width: 48, height: 144 } })
  warmGlobal()
  test('global viewport proxy is populated before actual output', canvasRenderer.getLastPaintStatistics()!.lodGroups === 1)
  canvasRenderer.render(outputReference.getContext('2d')!, outputScene, 500, null, new Map(), { renderMode: 'preview' })
  /** Decode actual output bytes and compare the complete composition at 1:1. */
  const compareOutput = async (blob: Blob) => {
    const bitmap = await createImageBitmap(blob), decoded = document.createElement('canvas')
    decoded.width = bitmap.width; decoded.height = bitmap.height
    try {
      decoded.getContext('2d')!.drawImage(bitmap, 0, 0)
      return bitmap.width === 192 && bitmap.height === 144 && compareLodPixels(outputReference, decoded, 1).maxError === 0
    } finally { bitmap.close(); decoded.width = decoded.height = 0 }
  }
  const raster = await acquireRasterImage(outputScene, new Map(), { format: 'png', timeMs: 500 })
  try {
    test('actual PNG ignores warm LOD and draws full composition exactly', canvasRenderer.getLastPaintStatistics()!.lodGroups === 0
      && canvasRenderer.getLastPaintStatistics()!.processed === 17 && await compareOutput(raster.value.blob))
  } finally { raster.release() }
  warmGlobal()
  // Restore only the reference canvas; the warm global cache remains populated.
  canvasRenderer.render(outputReference.getContext('2d')!, outputScene, 0, null, new Map(), { renderMode: 'preview' })
  const sequence = await acquireSequence(outputScene, new Map(), { format: 'png', fps: 1 })
  try {
    const entries = await new ZipReader().readAll(await sequence.value.blob.arrayBuffer())
    const bytes = Array.from(entries.values())[0]
    test('actual ZIP sequence ignores warm LOD and preserves every visible child', entries.size === 1
      && sequence.value.frameCount === 1 && canvasRenderer.getLastPaintStatistics()!.lodGroups === 0
      && canvasRenderer.getLastPaintStatistics()!.processed === 17
      && await compareOutput(new Blob([new Uint8Array(bytes)], { type: 'image/png' })))
  } finally { sequence.release(); staticGroupLodCache.clear(); outputReference.width = outputReference.height = 0 }
  test('viewport/output LOD never modifies serialized source layers', JSON.stringify(outputScene) === originalJson)
  draw(true).width = 0
  const failedCanvas = document.createElement('canvas'); failedCanvas.width = 192; failedCanvas.height = 144
  const failedContext = failedCanvas.getContext('2d')!
  failedContext.drawImage = () => { throw new Error('expected composite failure') }
  let compositeFailed = false
  try { renderer.render(failedContext, scene, 500, null, new Map(), { renderMode: 'preview', lod: { zoom: .5 } }) }
  catch { compositeFailed = true }
  test('failed LOD composite releases active shared reservation', compositeFailed && cache.getSnapshot().pinnedBytes === 0
    && budget.getSnapshot().protectedBytes === 0)
  failedCanvas.width = failedCanvas.height = 0
  const beforeIdle = cache.getSnapshot()
  await new Promise(resolve => setTimeout(resolve, 2250))
  const afterIdle = cache.getSnapshot()
  test('idle backing stores and signatures are released', beforeIdle.entries === 1
    && afterIdle.residentBytes === 0 && afterIdle.pendingBytes === 0, { beforeIdle, afterIdle })
  test('shared admission ledger is empty after native idle cleanup', budget.getSnapshot().chargedBytes === 0, { budget: budget.getSnapshot() })
  cache.clear(); scratch.dispose()
  document.querySelector('#status')!.textContent = passed ? 'PASS' : 'FAIL'
  document.querySelector('#report')!.textContent = JSON.stringify({ passed, results }, null, 2)
}
void check().catch(error => {
  document.querySelector('#status')!.textContent = 'FAIL'
  document.querySelector('#report')!.textContent = String(error)
})
