import type { MCPHost } from '../../mcp/editor'
import { executeEditorJob } from '../../mcp/editor'
import type { FrameEvalResult } from '@/app/hooks/useInteractiveRuntime'
import { ChronoPlayer } from '../../player/ChronoPlayer'
import { acquireRasterImage } from '../../export/raster/RasterExportEngine'
import { acquirePortableScene } from '../../export/portable/PortableSceneOutput'
import { OutputResources, editorOutputResources } from '../../export/resources'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'
import { modelAssetService } from '../resources/ModelAssetService'
import { VisualMediaSession } from '../../render/media/VisualMediaSession'
import { editorResourceBudget } from '../../resources/budget'
import { renderSurfacePool } from '../../render/resources/CanvasSurfacePool'
import { prepareRenderFrame } from '../../render/prepareRenderFrame'
import { pixelDifference, pngPixels, viewportPixels, preparedModelPixels, showFrame } from './clipPixelChecks'

export interface ClipFrameHost {
  readonly mcp: MCPHost
  evaluate(timeMs: number): FrameEvalResult
  /** QA host input only; normal app playback uses its existing transport. */
  seek(timeMs: number): Promise<void>
  releaseViewport(): Promise<void>
}
export interface ClipFrameCheck { name: string; passed: boolean; details?: unknown }

/** Real GLTFLoader/WebGL/Canvas/PNG acceptance, invoked by an explicit visible
 * test button. Uses the production MCP browser dispatcher, player, viewport
 * adapter and raster output; no mocked resource/render result. Read-only jobs
 * cannot change source, playhead or history. QA captures are bounded/sequential.
 */
export async function checkClipFrames(host: ClipFrameHost, canvases: readonly HTMLCanvasElement[], mountedPixels: Uint8ClampedArray) {
  const checks: ClipFrameCheck[] = [], scene = host.mcp.editor.getCommittedScene(), source = JSON.stringify(scene)
  const revision = host.mcp.editor.getRevision(), history = host.mcp.editor.getCommittedHistory()
  const player = new ChronoPlayer(scene, null, { loop: false }), outputs = new OutputResources({ budget: editorResourceBudget })
  const sequenceMedia = new VisualMediaSession(); sequenceMedia.start()
  const check = (name: string, passed: boolean, details?: unknown) => { checks.push({ name, passed, details }); if (!passed) throw new Error(name) }
  const samples: { timeMs: number; preview: ReturnType<typeof pixelDifference>; raster: ReturnType<typeof pixelDifference> }[] = []
  const repeated = new Map<number, Uint8ClampedArray>()
  const job = (method: string, args: Record<string, unknown>) => executeEditorJob({ id: `t2:${method}`, method, args }, host.mcp)
  let evidence: Uint8ClampedArray[] = [], peak = 0
  try {
    for (const timeMs of [0, 400, 500, 999, 1000, 1250, 1400, 1500, 2400, 500, 0]) {
      await host.seek(timeMs)
      const live = host.evaluate(timeMs), runtime = player.tick(timeMs)
      check(`live/player values agree at ${timeMs} ms`, JSON.stringify(Array.from(live.overrides)) === JSON.stringify(Array.from(runtime.overrides)))
      const liveReply = await job('evaluate_frame', {})
      const explicitReply = await job('evaluate_frame', { timeMs, timelineIds: ['outer'] })
      check(`MCP live/explicit values agree at ${timeMs} ms`, JSON.stringify(liveReply.values) === JSON.stringify(explicitReply.values))
      const viewport = await viewportPixels(scene, timeMs, live.overrides)
      if (timeMs === 500) check('mounted SceneCanvas equals prepared viewport pixels at 500 ms', pixelDifference(mountedPixels, viewport).changed === 0)
      const preview = await job('render_preview', { timeMs, timelineIds: ['outer'], width: scene.composition.width })
      const decoded = await pngPixels(new Blob([Uint8Array.from(atob(preview.data), char => char.charCodeAt(0))], { type: 'image/png' }))
      const raster = await acquireRasterImage(scene, new Map(), { format: 'png', timeMs }, { resources: outputs }, sequenceMedia)
      let final: Uint8ClampedArray
      try { final = await pngPixels(raster.value.blob); check(`raster warning-free at ${timeMs} ms`, raster.value.warnings.length === 0) }
      finally { raster.release() }
      const previewDiff = pixelDifference(viewport, decoded), rasterDiff = pixelDifference(viewport, final)
      samples.push({ timeMs, preview: previewDiff, raster: rasterDiff })
      check(`viewport/MCP PNG/raster pixel equality at ${timeMs} ms`, previewDiff.changed === 0 && rasterDiff.changed === 0, samples[samples.length - 1])
      if (repeated.has(timeMs)) check(`backwards scrub repeats exact pixels at ${timeMs} ms`, pixelDifference(viewport, repeated.get(timeMs)!).changed === 0)
      else if (timeMs === 0 || timeMs === 500) repeated.set(timeMs, viewport)
      if (timeMs === 1500) { evidence = [viewport, decoded, final]; evidence.forEach((pixels, i) => showFrame(canvases[i], pixels, scene.composition.width, scene.composition.height)) }
      peak = Math.max(peak, editorResourceBudget.getSnapshot().peakBytes)
    }
    check('actual rendered frames move across the sampled interval', pixelDifference(repeated.get(0)!, repeated.get(500)!).changed > 1000)
    check('one parsed model is shared across three source/instance presentations', modelAssetService.getSnapshot().residency.entries === 1)
    const portable = await acquirePortableScene(scene)
    try {
      const restored = parseSceneJson(JSON.stringify(portable.value), true)
      check('portable GLB and authored clips round-trip without runtime handles', restored.assets[0].url.startsWith('data:') && JSON.stringify(restored.layers) === JSON.stringify(scene.layers))
      check('portable reopen reproduces exact rendered pixels', pixelDifference(await viewportPixels(restored, 500, player.tick(500).overrides), repeated.get(500)!).changed === 0)
    } finally { portable.release() }
    check('source, manual keys, revision and history remain unchanged', JSON.stringify(host.mcp.editor.getCommittedScene()) === source && host.mcp.editor.getRevision() === revision && host.mcp.editor.getCommittedHistory() === history)
    const abort = new AbortController(); abort.abort()
    let cancelled = false
    try { const result = await acquireRasterImage(scene, new Map(), { format: 'png', timeMs: 500 }, { resources: outputs, signal: abort.signal }); result.release() }
    catch { cancelled = true }
    check('pre-cancelled render produces no stale output', cancelled)
    await host.releaseViewport()
    // With no viewport pinned, probe explicit resource lifetime using the same
    // prepared resource that final jobs consume. Stale snapshots must expire.
    const media = new VisualMediaSession(); media.start()
    media.setDemand([{ key: 't2-pin', asset: scene.assets[0], required: true }]); await media.ready()
    const borrowed = media.elements(); check('prepared model is available while pinned', !!borrowed.modelForAsset?.(scene.assets[0].id))
    try {
      const resource = borrowed.modelForAsset!(scene.assets[0].id)!, frame = prepareRenderFrame(scene, 500)
      const a = frame.index.get('original')!.model3d!, b = frame.index.get('copy')!.model3d!
      const first = preparedModelPixels(resource, a), other = preparedModelPixels(resource, b), again = preparedModelPixels(resource, a)
      check('shared GPU resource resets pose/camera/light between owners (A→B→A)', pixelDifference(first, again).changed === 0 && pixelDifference(first, other).changed > 100)
    } finally { media.stop() }
    check('released model snapshot expires', !borrowed.modelForAsset?.(scene.assets[0].id))
  } finally {
    player.destroy(); await host.releaseViewport(); sequenceMedia.stop(); outputs.dispose(); editorOutputResources.clearIdle(); renderSurfacePool.clearIdle(); modelAssetService.clearIdle()
  }
  const usage = editorResourceBudget.getSnapshot()
  check('output/model jobs and managed reservations are fully released', outputs.getSnapshot().jobs.active === 0 && outputs.getSnapshot().residency.chargedBytes === 0
    && modelAssetService.getSnapshot().residency.chargedBytes === 0 && modelAssetService.getSnapshot().preparation.active === 0 && usage.chargedBytes === 0, usage)
  return { passed: true, checks, samples, peakChargedBytes: peak, budgetBytes: usage.maxBytes,
    scope: 'Same-browser WebGL2 + Canvas2D RGBA8/default color policy at composition resolution; no cross-GPU, native GLB clips, full Export E0 or process/GPU RAM claim.' }
}
