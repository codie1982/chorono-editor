/** Compose a finite per-consumer deadline with caller cancellation. work must
 * observe the supplied signal (e.g. SharedPreparationQueue.request); this helper
 * never claims its underlying native work has stopped. Source/native tickets
 * stay with the producer until actual settlement. Timer/listener cleanup occurs
 * on every consumer outcome; timeout includes time waiting in the queue. */
export async function withPreparationDeadline<T>(label:string,timeoutMs:number,signal:AbortSignal|undefined,
  work:(signal:AbortSignal)=>Promise<T>):Promise<T> {
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<=0||timeoutMs>2147483647)throw new RangeError('Invalid preparation deadline.')
  const controller=new AbortController(),abort=()=>controller.abort()
  let timedOut=false
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort()
  const timer=setTimeout(()=>{timedOut=true;controller.abort()},timeoutMs)
  try{return await work(controller.signal)}
  catch(error){if(timedOut){const failure=new Error(`${label} timed out.`);failure.name='TimeoutError';throw failure}throw error}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
}
