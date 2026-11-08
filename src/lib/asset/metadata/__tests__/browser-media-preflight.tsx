import {assetSourcePool} from '../../sources'
import {admissionFixture} from './nativeAdmissionFixture'
import {checkNativeImageAdmission} from './nativeImageAdmission'
import {checkNativeFontPcmAdmission} from './nativeFontPcmAdmission'
import {checkNativePreviewLifecycle} from './nativePreviewLifecycle'

/** Standalone browser acceptance, compiled from production entry points. No
 * editor injection, authoring eval, camera/microphone or external media service. */
async function run(copies:HTMLElement,host:HTMLElement,panel:HTMLElement){
  const f=admissionFixture(copies),baseline=assetSourcePool.getSnapshot()
  let failure:unknown
  try{
    const {png,probes}=await checkNativeImageAdmission(f)
    await checkNativeFontPcmAdmission(f)
    await checkNativePreviewLifecycle(f,png,probes,host,panel)
  }catch(error){failure=String(error)}
  finally{await f.cleanup()}
  const final={budget:f.budget.getSnapshot(),jobs:f.executor.getSnapshot(),sources:assetSourcePool.getSnapshot()}
  const clean=final.budget.chargedBytes===0&&final.jobs.active===0&&final.jobs.queued===0
    &&final.sources.references===baseline.references&&final.sources.ownedUrls===baseline.ownedUrls
  f.rows.push({name:'all private native admission owners and source leases return to baseline',passed:clean,details:final})
  const identity=await(await fetch('media-preflight-sources.json')).json()
  return {passed:!failure&&f.rows.every(row=>row.passed),error:failure,results:f.rows,final,
    build:{bundleSha256:identity.bundleSha256,cssSha256:identity.cssSha256,fixtureSha256:identity.fixtureSha256},
    environment:{userAgent:navigator.userAgent,width:innerWidth,height:innerHeight,dpr:devicePixelRatio},
    scope:'Private 512 MiB ledger; actual native codecs/FontFace/WebAudio/production sprite component. Gates hold post-native delivery, not busy native decoding. Captured panel is labelled; copied evidence canvases and native internals are outside managed totals.'}
}
const app=document.getElementById('app')!
app.innerHTML='<style>body{margin:0;background:#080f1d;color:#e2e8f0;font:14px system-ui}#app{padding:24px}button,input{font:inherit}button{padding:8px 14px;cursor:pointer}canvas{background:#111827}figure{margin:0}figcaption{font-size:12px;color:#94a3b8;margin:6px 0 14px}#copies{display:flex;flex-wrap:wrap;gap:16px}pre{white-space:pre-wrap;font-size:12px}#panel{max-width:650px}[role=dialog]{padding:20px;background:#172033;border:1px solid #4b5563;max-width:600px}</style><h1>Native media preflight · OPT28</h1><p>Bounded headers · native preview pins · PCM output admission · font binary/outline ownership</p><button id="run">Run native admission checks</button><p id="status" role="status">Ready</p><div id="copies"></div><div id="modal"></div><pre id="summary"></pre><pre id="report" hidden></pre><div id="panel"></div>'
const button=document.getElementById('run') as HTMLButtonElement,status=document.getElementById('status')!
button.onclick=async()=>{
  button.disabled=true;status.textContent='Running';document.getElementById('copies')!.replaceChildren()
  try{
    const result=await run(document.getElementById('copies')!,document.getElementById('modal')!,document.getElementById('panel')!)
    document.getElementById('report')!.textContent=JSON.stringify(result,null,2)
    document.getElementById('summary')!.textContent=JSON.stringify({passed:result.passed,error:result.error,checks:result.results.length,
      finalCharge:result.final.budget.chargedBytes,peakCharge:result.final.budget.peakBytes,jobs:result.final.jobs.active,rows:result.results.map(row=>({name:row.name,passed:row.passed}))},null,2)
    status.textContent=result.passed?'PASS':'FAIL'
  }catch(error){document.getElementById('report')!.textContent=JSON.stringify({passed:false,error:String(error)});status.textContent='FAIL'}
  finally{button.disabled=false}
}
