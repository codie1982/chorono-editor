import type {ChronoScene} from '../../types'
import {measureJson} from '../../format/json'
import {exportToRuntime,usesSignalSystem,type RuntimeExportOptions} from '../runtimeExport'
import type {OutputScope} from '../resources'

/** Admission wrapper for the existing JsonModal runtime schema (different from
 * RuntimeExporter packages; this does not merge them before Export E0). Dense
 * bake samples are counted BEFORE bake/sort/RDP allocation. The existing bake
 * may add an endpoint after floating-point stepping, so ceil(duration*fps/1000)
 * +2 is conservative. Limits reject explicitly; sample rate/tolerance/output
 * ordering are never silently changed. Source-node and sample sizes are policy
 * estimates, not JS heap measurements. Input is borrowed, returned graph belongs
 * to scope. Reuses the authoritative signal-track predicate and exporter. */
export function legacyRuntimeInScope(scene:ChronoScene,scope:OutputScope,options:RuntimeExportOptions={}){
  const measured=measureJson(scene,{maxBytes:96*1024**2}),fps=options.bakeFps??60
  if(!Number.isFinite(fps)||fps<1||fps>240)throw new RangeError('Invalid runtime bake sample rate.')
  let samples=0
  for(const timeline of scene.timelines){
    if(!Number.isFinite(timeline.durationMs)||timeline.durationMs<0)throw new RangeError('Invalid runtime timeline duration.')
    for(const track of timeline.tracks)if(options.bakeSignalSystem!==false&&usesSignalSystem(track)){
      const count=Math.ceil(timeline.durationMs*fps/1000)+2
      if(count>20000||!Number.isSafeInteger(count))throw new RangeError('Runtime bake exceeds the per-track sample limit.')
      samples+=count
      if(samples>100000)throw new RangeError('Runtime bake exceeds the aggregate sample limit.')
    }
  }
  return scope.own(Math.max(1,measured.nodes*256+samples*1024),()=>exportToRuntime(scene,options)).value
}
