/** Poll actual browser state with a finite deadline. Test-only adapter; it never
 * manufactures native success or closes real work on timeout. No production
 * poller/cache is installed. Predicate must be synchronous and non-mutating. */
export async function until(test:()=>boolean,options:{timeoutMs?:number;label?:string}={}):Promise<void>{
  const timeout=options.timeoutMs??20000
  if(!Number.isSafeInteger(timeout)||timeout<1||timeout>60000)throw new RangeError('Invalid native QA deadline.')
  const end=performance.now()+timeout
  while(!test()){
    if(performance.now()>end)throw new Error(`${options.label??'Native acceptance'} QA timed out`)
    await new Promise(requestAnimationFrame)
  }
}
/** Explicit delivery gate. It does not represent unfinished native work. */
export function deliveryGate(){let release!:()=>void;const promise=new Promise<void>(yes=>{release=yes});return {promise,release}}
