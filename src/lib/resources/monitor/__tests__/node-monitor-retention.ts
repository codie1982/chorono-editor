import assert from 'node:assert/strict'
import {setImmediate} from 'node:timers/promises'
import {emptyScene,newRectLayer} from '@/lib/defaults'
import {ProjectResourceMonitor} from '../ProjectResourceMonitor'

/** Isolated GC ownership regression, run by monitor-retention.mjs with
 * node --expose-gc. This is deliberately separate from unforced native Chrome
 * playback/heap measurements. It checks a paused collector: no snapshot read
 * is allowed between replacing inputs and checking the previous scene's reachability.
 * Current borrowed inputs must remain alive; old project graphs must not.
 */
function pausedProjectSwitch() {
  const previous={...emptyScene(),layers:[newRectLayer()]},current=emptyScene()
  const audio=()=>({bytes:0,bufferCount:0,pendingCount:0,assets:[]})
  const monitor=new ProjectResourceMonitor({scene:previous,media:new Map(),isPlaying:false,audio})
  assert.equal(monitor.getSnapshot().project.layers,1)
  const previousRef=new WeakRef(previous),currentRef=new WeakRef(current)
  monitor.setInputs({scene:current,media:new Map(),isPlaying:false,audio})
  return {monitor,previousRef,currentRef}
}

/** Two fresh turns allow WeakRef's keep-alive job to end before explicit GC. */
async function main():Promise<void> {
  const gc=(globalThis as typeof globalThis & {gc?:()=>void}).gc
  assert.ok(gc,'Run with node --expose-gc; this check must not silently skip')
  const cases=Array.from({length:20},pausedProjectSwitch)
  await setImmediate();gc();await setImmediate();gc()
  const oldCollected=cases.filter(item=>item.previousRef.deref()===undefined).length
  const currentRetained=cases.filter(item=>item.currentRef.deref()!==undefined).length
  const result={kind:'paused-resource-monitor-retention',cases:cases.length,oldCollected,currentRetained,
    scope:'Isolated Node explicit GC; not a native browser allocation, RAM or playback measurement.'}
  console.log(JSON.stringify(result))
  assert.equal(oldCollected,cases.length,'Paused resource monitors retained previous project scenes')
  assert.equal(currentRetained,cases.length,'Current borrowed scene was unexpectedly released')
  for(const item of cases)assert.equal(item.monitor.getSnapshot().project.layers,0)
}
void main()
