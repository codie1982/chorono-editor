import {assetSourcePool} from '../../asset/sources'
import type {ResourceLease} from '../../resources/residency'

/** Browser handoff retains an independent output pin and original Blob URL for
 * a finite five-second delivery grace, reusing the source URL owner. There is no
 * platform download-completed event here: this is bounded handoff policy, not
 * proof of disk completion. UI may release its own pin immediately afterwards.
 * Setup/click failures release both owners; no input/scene data is modified. */
export function downloadOutput<T>(lease:ResourceLease<T>,blob:(value:T)=>Blob,filename:string):void{
  if(!filename.length||filename.length>1024)throw new RangeError('Output filename must contain 1–1024 characters.')
  const retained=lease.retain()
  let source:ReturnType<typeof assetSourcePool.create>|undefined
  const release=()=>{source?.release();retained.release()}
  try{
    source=assetSourcePool.create(blob(retained.value))
    const link=document.createElement('a');link.href=source.url;link.download=filename;link.click()
    const timer=setTimeout(release,5000);timer.unref?.()
  }catch(error){release();throw error}
}
