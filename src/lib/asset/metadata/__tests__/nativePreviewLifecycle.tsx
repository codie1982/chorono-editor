import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {flushSync} from 'react-dom'
import SpriteSheetImportModal from '@/components/modals/SpriteSheetImportModal'
import {MediaResourcesSection} from '@/components/resources/MediaResourcesSection'
import {ManagedBudgetSection} from '@/components/resources/ManagedBudgetSection'
import {ProjectResourceMonitor} from '../../../resources/monitor/ProjectResourceMonitor'
import {emptyScene} from '../../../defaults'
import {OutlineFontService} from '../../../text/fonts/OutlineFontService'
import {deliveryGate,until,type AdmissionFixture} from './nativeAdmissionFixture'
import type {MediaProbeService} from '../MediaProbeService'

/** Exercise actual production modal/state in StrictMode, including stale preview
 * handoff, bounded DOM grid, invalid cells, cancel and diagnostic composition. */
export async function checkNativePreviewLifecycle(f:AdmissionFixture,file:File,probes:MediaProbeService,host:HTMLElement,panel:HTMLElement) {
  const root=createRoot(host),panelRoot=createRoot(panel),outlines=new OutlineFontService({budget:f.budget,executor:f.executor})
  const monitor=new ProjectResourceMonitor({scene:emptyScene(),media:new Map(),isPlaying:false},{budget:f.budget,probes,outlines,mediaPreparation:f.executor})
  let imported=0
  const cancelledBefore=probes.getSnapshot().preparation.cancelled
  const close=()=>flushSync(()=>root.render(null))
  try{
    flushSync(()=>root.render(<StrictMode><SpriteSheetImportModal file={file} probes={probes} onClose={close} onImport={()=>{imported++}}/></StrictMode>))
    await until(()=>host.querySelectorAll('img').length===1&&!!host.textContent?.includes('32×32px source'))
    const count=host.querySelectorAll('*').length
    f.test('actual development StrictMode effect replay cancels obsolete work and owns one native image',host.querySelectorAll('img').length===1&&probes.getSnapshot().residency.protectedBytes===4096&&probes.getSnapshot().preparation.cancelled>cancelledBefore)
    const inputs=host.querySelectorAll('input'),set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!
    const change=(value:string)=>{set.call(inputs[0],value);inputs[0].dispatchEvent(new Event('input',{bubbles:true}))}
    change('1000000000');await until(()=>!!host.querySelector('[role=alert]'))
    const submit=Array.from(host.querySelectorAll('button')).find(button=>button.textContent?.includes('Import '))!
    f.test('invalid sprite grid refuses zero-pixel cells without per-frame DOM expansion',submit.disabled&&host.querySelectorAll('*').length<=count+2)
    change('32');await until(()=>!submit.disabled)
    f.test('dense valid sprite grid uses constant DOM rather than one node per frame',host.querySelectorAll('*').length<=count+2)
    submit.click();await until(()=>!host.querySelector('[role=dialog]')&&probes.getSnapshot().residency.chargedBytes===0)
    f.test('native sprite submit delivers once and releases the preview pin',imported===1)
    const gate=deliveryGate();let delivered=false
    const delayed={preview:async(file:File,execution?:{signal?:AbortSignal})=>{
      const pin=await probes.preview(file,execution);delivered=true;await gate.promise;return pin
    }}
    flushSync(()=>root.render(<SpriteSheetImportModal file={file} probes={delayed} onClose={close} onImport={()=>{imported++}}/>))
    await until(()=>delivered);close();gate.release()
    await until(()=>probes.getSnapshot().residency.chargedBytes===0)
    f.test('unmounted modal releases a late ready preview rather than appending stale content',host.querySelectorAll('img').length===0&&imported===1)
    const active=f.pin(await probes.preview(file)),snapshot=monitor.getSnapshot()
    flushSync(()=>panelRoot.render(<><h2>Captured while native preview was pinned</h2><MediaResourcesSection snapshot={snapshot} query={{page:0,search:''}} onQuery={()=>{}}/><ManagedBudgetSection snapshot={snapshot.budget}/></>))
    f.test('actual panel exposes probe/outline policy with shared counts kept separate',snapshot.probes.residency.protectedBytes===4096&&panel.textContent!.includes('Probes · policy charge / limit')&&panel.textContent!.includes('Outline fonts · policy charge / limit')&&snapshot.knownBytes===0)
    active.release();monitor.clearIdle()
  }finally{
    root.unmount();const markup=panel.innerHTML;panelRoot.unmount();panel.innerHTML=markup;outlines.dispose();probes.clearIdle()
  }
}
