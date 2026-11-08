import type {AudioPcmLease} from '../AudioPcmCache'
import type {buildAudioClipSchedule} from '../audioEvaluation'

type Schedule=NonNullable<ReturnType<typeof buildAudioClipSchedule>>
interface Clip{lease?:AudioPcmLease;source?:AudioBufferSourceNode;gain?:GainNode;pan?:StereoPannerNode}

/** Native offline graph adapter with explicit source-pin ownership. Construction
 * is cold; open occurs only after an output policy reservation exists. Each
 * addOwnedClip transfers its PCM pin even if partial native setup fails. All
 * sources/nodes are detached before those pins release. Cleanup failure keeps
 * the failed clip/pin for output-owner quarantine and explicit retry.
 * OfflineAudioContext has no close API: after actual rendering settles, native
 * references are dropped for browser GC. This is not physical-RAM reclamation.
 */
export class OfflineAudioGraph {
  private context:OfflineAudioContext|null=null
  private master:GainNode|null=null
  private readonly clips:Clip[]=[]
  private pending=false
  private started=false
  private disposed=false

  /** Allocate the native context only after caller admission. Partial setup is
   * retained in fields so dispose can clean failures before publication. */
  open(frames:number,sampleRate:number,volume:number):void{
    if(this.context||this.disposed)throw new Error('Offline audio graph is already open or disposed.')
    this.context=new OfflineAudioContext(2,frames,sampleRate)
    this.master=this.context.createGain();this.master.gain.value=volume;this.master.connect(this.context.destination)
  }

  /** Transfer a source pin and schedule the same gain/pan/source-time automation
   * as the existing mix. Times are native context seconds; no source copying or
   * timeline evaluation occurs in this platform adapter. */
  addOwnedClip(lease:AudioPcmLease,schedule:Schedule):void{
    const clip:Clip={lease};this.clips.push(clip)
    if(!this.context||!this.master||this.started||this.disposed)throw new Error('Offline audio graph cannot add a clip now.')
    clip.source=this.context.createBufferSource();clip.gain=this.context.createGain();clip.pan=this.context.createStereoPanner()
    const source=clip.source
    source.buffer=lease.buffer;source.loop=schedule.loop;source.playbackRate.value=schedule.sourceRate
    source.connect(clip.gain).connect(clip.pan).connect(this.master)
    this.automate(clip.gain.gain,schedule.gainPoints);this.automate(clip.pan.pan,schedule.panPoints)
    source.start(schedule.contextStartSec,schedule.sourceOffsetSec);source.stop(schedule.stopTimeSec)
  }

  /** Await actual native completion. Cancellation is observed by the enclosing
   * output scope without racing this non-abortable promise or releasing input. */
  async render():Promise<AudioBuffer>{
    if(!this.context||this.started)throw new Error('Offline audio graph cannot render now.')
    this.started=true;this.pending=true
    try{return await this.context.startRendering()}finally{this.pending=false}
  }

  /** Attempt every clip cleanup. A failed native detach preserves its source
   * pin; successful siblings release independently. Retry is safe/idempotent. */
  dispose():void{
    if(this.pending)throw new Error('Offline audio is still rendering.')
    let failure:unknown
    for(const clip of this.clips){
      if(!clip.lease)continue
      try{
        if(clip.source){clip.source.buffer=null;clip.source.disconnect()}
        clip.gain?.disconnect();clip.pan?.disconnect();clip.lease.release();clip.lease=undefined
      }catch(error){failure??=error}
    }
    try{this.master?.disconnect()}catch(error){failure??=error}
    if(failure)throw failure
    this.clips.length=0;this.master=null;this.context=null;this.disposed=true
  }

  /** Existing ordered linear automation, without allocating points.slice(1). */
  private automate(param:AudioParam,points:Schedule['gainPoints']):void{
    if(!points.length)return
    param.setValueAtTime(points[0].value,points[0].timeSec)
    for(let i=1;i<points.length;i++)param.linearRampToValueAtTime(points[i].value,points[i].timeSec)
  }
}
