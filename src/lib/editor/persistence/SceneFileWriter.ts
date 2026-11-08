import type {ChronoScene} from '../../types'
import {assetSourcePool} from '../../asset/sources'
import {BoundedJobQueue} from '../../resources/jobs'
import {OutputResources,editorOutputResources} from '../../export/resources'
import {OwnedSceneFileWrite,type SceneWritable} from './OwnedSceneFileWrite'

/** One selected-folder writer. Its FIFO serializes current/snapshot file writes
 * (1 active,2 waiting), while all actual IO also enters the shared output queue.
 * Reuses existing queue/admission instead of retaining unbounded write promises.
 * Original source pins cover local wait, global wait and actual native cleanup.
 * Dispose cancels only this writer; already-running IO is awaited to settlement.
 * Source scene and caller open callback are never persisted/cached afterwards.
 */
export class SceneFileWriter{
  private readonly queue=new BoundedJobQueue({concurrency:1,maxQueued:2})
  constructor(private readonly resources:OutputResources=editorOutputResources){}
  /** Submit a file operation. open is invoked only after text/native-work policy
   * admission, so quota rejection cannot truncate/create the target file. */
  write(scene:ChronoScene,open:()=>Promise<SceneWritable>,signal?:AbortSignal):Promise<void>{
    return assetSourcePool.withAssets(scene.assets,()=>this.queue.submit(async local=>{
      const result=await this.resources.run(async(scope,native)=>{
        const operation=scope.own(4096,()=>new OwnedSceneFileWrite(this.resources),value=>value.dispose())
        await operation.value.write(scene,open,native)
      },{signal:local})
      result.release()
    },{signal}))
  }
  /** Cancels local queued/active work without closing the shared output owner. */
  dispose():void{this.queue.dispose()}
  /** Detached per-folder orchestration only, overlapping global output counts. */
  getSnapshot(){return this.queue.getSnapshot()}
}
