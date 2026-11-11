import type {ChronoScene} from '../../types'
import {OutputScope,OutputResources,outputJson} from '../../export/resources'
import type { HistoryState } from '../history'
import { sessionProjectInScope } from '../session/SessionProjectOutput'

/** Minimal native writable port. close commits; abort discards a partial write.
 * Implementations must settle actual IO, not an abort/timeout race. */
export interface SceneWritable{write(text:string):Promise<void>;close():Promise<void>;abort(reason?:unknown):Promise<void>}

/** Owns text plus a native writable through write/close/abort settlement. A cold
 * instance is admitted by SceneFileWriter before opening native IO. Its private
 * independent scope cannot be closed by the parent while failed native cleanup
 * still borrows text. Successful close/abort drops that scope before uncharging.
 *
 * Failed abort is quarantined by the normal output owner: first dispose reports
 * the failure; a later explicit clearIdle starts one async retry. While retry is
 * pending, charge stays protected. Only successful actual abort requests final
 * synchronous cleanup retry; failures do not spin/retry on a timer. File API
 * storage/kernel buffers remain opaque and physical RAM is not measured here.
 */
export class OwnedSceneFileWrite{
  private readonly text:OutputScope
  private writable:SceneWritable|null=null
  private closed=false
  private cleanupPending=false
  private quarantined=false
  constructor(private readonly resources:OutputResources){this.text=new OutputScope(resources)}

  /** Serialize under admission, open once and await actual IO. Source scene is
   * borrowed; caller pins its assets throughout queue/IO. signal is observed at
   * phase boundaries. Abort during a non-abortable write keeps all backing until
   * write settles, then aborts instead of committing a stale document. */
  async write(scene:ChronoScene,open:()=>Promise<SceneWritable>,signal:AbortSignal,session?:{sessionId:string;history:HistoryState}):Promise<void>{
    try{
      this.text.check(signal)
      const value=session?await sessionProjectInScope(session.history,session.sessionId,this.text,signal):scene
      const json=outputJson(this.text,value,{space:2,maxChars:64*1024**2,maxBytes:64*1024**2})
      this.writable=await open();this.text.check(signal)
      await this.writable.write(json.value);this.text.check(signal)
      await this.writable.close();this.finish()
    }catch(error){
      if(this.writable){try{await this.abort()}catch{/* Keep writable + text for quarantine. */}}
      else this.finish()
      throw error
    }
  }

  /** Synchronous cache disposer. Pending/failed async native cleanup is never
   * represented as complete. A subsequent explicit call may start one retry. */
  dispose():void{
    if(this.closed){this.text.dispose();return}
    if(!this.writable){this.finish();return}
    if(!this.quarantined){this.quarantined=true;throw new Error('Scene file abort failed; output retained for retry.')}
    if(!this.cleanupPending){
      this.cleanupPending=true
      void this.abort().then(()=>{this.resources.clearIdle()},()=>{}).finally(()=>{this.cleanupPending=false})
    }
    throw new Error('Scene file cleanup is still pending.')
  }
  /** Actual native abort keeps text and writer references until it succeeds. */
  private async abort():Promise<void>{await this.writable!.abort();this.finish()}
  /** Release native references and text ownership only after successful cleanup. */
  private finish():void{this.writable=null;this.closed=true;this.text.dispose()}
}
