import type { ChronoScene } from '../../types'
import type { OverrideMap } from '../../evaluator'
import { assetSourcePool } from '../../asset/sources'
import { VisualMediaSession } from './VisualMediaSession'
import { prepareRenderFrame } from '../prepareRenderFrame'
import { videoForLayer, type AssetElementMap } from '../../asset/visual/AssetElementMap'
import { videoFrameTime } from '../../asset/visual/videoFrameTime'
import {cancelledJobError} from '../../resources/jobs'

/** Await a native paused seek. The caller owns the clip pin throughout; timeout
 * and errors reject final output rather than encode the previous video frame. */
async function seek(element: HTMLVideoElement, seconds: number): Promise<void> {
  if (Math.abs(element.currentTime - seconds) <= 1e-6 && !element.seeking) return
  await new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => { clearTimeout(timer); element.removeEventListener('seeked', done); element.removeEventListener('error', failed); error ? reject(error) : resolve() }
    const done = () => finish(), failed = () => finish(new Error('Video frame seek failed.'))
    const timer = setTimeout(() => finish(new Error('Video frame seek timed out.')), 10000)
    element.addEventListener('seeked', done, { once: true }); element.addEventListener('error', failed, { once: true })
    try { element.pause(); element.currentTime = seconds } catch (error) { finish(error instanceof Error ? error : new Error(String(error))) }
  })
}

/**
 * An independent final/preview consumer, never the editor viewport's borrowed
 * Map. Resolve full-composition demand, await every required native resource and
 * each clip's source-time frame, then keep pins through callback/encode settlement.
 * Optional caller-owned session supports sequential sequence frames without new
 * video decoder identities each frame. Source URLs are pinned across the job;
 * the creator stops an internally owned session on every success/failure.
 * Optional abort stops preparation (including a supplied job-owned session),
 * but media stays pinned during an already-running callback/encoder. Work owns
 * its output cleanup and must actually settle before these pins are dropped.
 */
export async function withMediaFrame<T>(scene: ChronoScene, timeMs: number, context: CanvasRenderingContext2D,
  options: { overrides?: OverrideMap;signal?:AbortSignal }, work: (assets: AssetElementMap, overrides: OverrideMap) => T | Promise<T>,
  supplied?: VisualMediaSession): Promise<T> {
  return assetSourcePool.withAssets(scene.assets, async () => {
    const owner = supplied ?? new VisualMediaSession()
    const check=()=>{if(options.signal?.aborted)throw cancelledJobError()}
    let preparing=true
    const abort=()=>{if(preparing)owner.stop()}
    options.signal?.addEventListener('abort',abort,{once:true})
    if (!supplied) owner.start()
    try {
      check()
      const frame = prepareRenderFrame(scene, timeMs, options.overrides)
      owner.request({ frame, context })
      await owner.ready()
      preparing=false;check()
      const assets = owner.elements()
      for (const layer of frame.scene.layers) {
        if (!layer.video) continue
        const element = videoForLayer(assets, layer.id, layer.video.assetId)
        if (element) await seek(element, videoFrameTime(layer, timeMs, element.duration))
      }
      check()
      const result=await work(assets, frame.overrides);check();return result
    } catch(error){check();throw error
    } finally {options.signal?.removeEventListener('abort',abort);if (!supplied) owner.stop() }
  })
}
