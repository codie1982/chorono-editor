import type { ChronoScene } from '@/lib/types'
import { evaluateTimelines } from '@/lib/evaluator'
import { CanvasRenderer } from '../../CanvasRenderer'
import { CanvasSurfacePool } from '../CanvasSurfacePool'
import { compareLodPixels } from '@/lib/resources/benchmark/__tests__/compareLodPixels'

/** Uses the immutable benchmark project copy, not the editor's open document.
 * Opt-out reference and optimized rendering share the same evaluator/backend.
 * Timings here are deliberately excluded from performance acceptance. */
async function check() {
  document.body.innerHTML='<style>body{font:15px system-ui;padding:24px}canvas{width:48%}pre{white-space:pre-wrap}</style><h1>Four Seasons — ROI full-frame parity</h1><p id="status">Running…</p><div id="examples"></div><pre id="report"></pre>'
  const scene:ChronoScene=await (await fetch('four-seasons.chorono.json')).json()
  const pools=[new CanvasSurfacePool(),new CanvasSurfacePool()]
  const renderers=[new CanvasRenderer(pools[0],undefined,false),new CanvasRenderer(pools[1])]
  const canvases=renderers.map(()=>{const canvas=document.createElement('canvas');canvas.width=scene.composition.width;canvas.height=scene.composition.height;return canvas})
  const results=[]
  try {
    for(const fraction of [0,0.125,0.25,0.5,0.75,1-1/scene.composition.durationMs]) {
      const timeMs=fraction*scene.composition.durationMs,overrides=evaluateTimelines(scene.timelines,timeMs)
      renderers.forEach((renderer,i)=>renderer.render(canvases[i].getContext('2d')!,scene,timeMs,null,new Map(),{overrides,renderMode:'preview'}))
      const quality=compareLodPixels(canvases[0],canvases[1],1)
      results.push({timeMs,passed:quality.maxError<=2&&quality.rmse<=0.25,quality,reference:pools[0].getSnapshot(),actual:pools[1].getSnapshot()})
    }
    document.querySelector('#examples')!.append(...canvases)
    const beforeIdle=pools.map(pool=>pool.getSnapshot())
    await new Promise(resolve=>setTimeout(resolve,2250))
    const idle=pools.map(pool=>pool.getSnapshot())
    const passed=results.every(row=>row.passed)&&idle.every(pool=>pool.residentBytes===0)
    document.querySelector('#status')!.textContent=passed?'PASS':'FAIL'
    document.querySelector('#report')!.textContent=JSON.stringify({passed,results,beforeIdle,idle},null,2)
  } finally {pools.forEach(pool=>pool.dispose())}
}
void check().catch(error=>{document.querySelector('#status')!.textContent='FAIL';document.querySelector('#report')!.textContent=String(error)})
