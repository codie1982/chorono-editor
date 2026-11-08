import {GPUImageEffects} from '../../effects/GPUImageEffects'
import {GPUMotionBlur} from '../../effects/GPUMotionBlur'
import {WebGLInstancedQuadBackend} from '../../particles/WebGLInstancedQuadBackend'
import {gpuImageEffects as referenceBlur} from 'gpu-reference-image'
import {gpuMotionBlur as referenceMotion} from 'gpu-reference-motion'
import {WebGLInstancedQuadBackend as ReferenceParticles} from 'gpu-reference-particle'
import {ResourceBudget} from '@/lib/resources/budget'
import {GpuAdmissionError} from '../GpuStorageOwner'
import {gpuCapabilities} from '../../GPUCapabilities'
import {ParticleInstance} from '@/lib/particles/runtime/ParticleInstance'
import {buildEmitterLayer} from '@/lib/particles/buildEmitterLayer'
import {ProjectResourceMonitor} from '@/lib/resources/monitor/ProjectResourceMonitor'
import {emptyScene} from '@/lib/defaults'
import {ComputeResourcesSection} from '@/components/resources/ComputeResourcesSection'
import {createElement} from 'react'
import {createRoot} from 'react-dom/client'
import {flushSync} from 'react-dom'

/** Native assertion; thrown errors keep the report visibly failed. */
function assert(value,message){if(!value)throw new Error(message)}
/** Separate readback canvas avoids changing the rendering backend's strategy. */
function pixels(canvas){
 const copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height
 const context=copy.getContext('2d',{willReadFrequently:true});context.drawImage(canvas,0,0)
 const data=context.getImageData(0,0,copy.width,copy.height).data
 copy.width=copy.height=0;return data
}
/** Exact byte equality; tolerance never hides a changed shader/upload contract. */
function equal(a,b){assert(a.length===b.length,'Pixel dimensions differ');for(let i=0;i<a.length;i++)if(a[i]!==b[i])throw new Error(`RGBA differs at ${i}: ${a[i]} / ${b[i]}`)}
/** Asymmetric transparent fixture exercises orientation and premultiplication. */
function input(width=96,height=64,offset=0){
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height
 const c=canvas.getContext('2d'),gradient=c.createLinearGradient(0,0,width,height)
 gradient.addColorStop(0,'#ff8040cc');gradient.addColorStop(1,'#4080ff40')
 c.fillStyle=gradient;c.fillRect(3+offset,5,width-20,height-15)
 c.fillStyle='#20dd8055';c.beginPath();c.arc(width*.7,height*.3,11,0,Math.PI*2);c.fill()
 return canvas
}
/** Caller-owned visual proof copies survive disposal of both source backends. */
function preview(canvas,label){
 const figure=document.createElement('figure'),caption=document.createElement('figcaption'),copy=document.createElement('canvas')
 caption.textContent=label;copy.width=canvas.width;copy.height=canvas.height;copy.getContext('2d').drawImage(canvas,0,0)
 figure.append(caption,copy);document.querySelector('#examples').append(figure)
}
/** One finite native context transition, not a restart on observation timeout. */
function contextEvent(canvas,name,action){return new Promise((resolve,reject)=>{
 const done=()=>{clearTimeout(timer);resolve()}
 const timer=setTimeout(()=>{canvas.removeEventListener(name,done);reject(new Error(`${name} timed out`))},5000)
 canvas.addEventListener(name,done,{once:true});action()
})}
/** Reference contexts are fixture-owned; force final loss after all comparisons. */
function releaseReference(canvas){
 if(!canvas)return
 const gl=canvas.getContext('webgl2')??canvas.getContext('webgl')
 gl?.getExtension('WEBGL_lose_context')?.loseContext();canvas.width=canvas.height=0
}

/** End-to-end native admission, pixel and cleanup verification. No project
 * authoring, scene mutation, remote upload or model-code evaluation is involved. */
async function main(){
 document.body.innerHTML='<style>body{font:14px system-ui;padding:24px;background:#f4f6fa;color:#14232d}#examples{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0;padding:12px;border:1px solid #ccd5dc;background:white}canvas{image-rendering:auto;width:288px;background:repeating-conic-gradient(#edf0f4 0% 25%,white 0% 50%) 0/12px 12px}#panel{max-width:640px;background:white;padding:20px;margin-top:20px}pre{white-space:pre-wrap}</style><h1>GPU storage ownership</h1><p id="status">Running…</p><div id="examples"></div><div id="panel"></div><pre id="summary"></pre><pre id="report" hidden></pre>'
 const checks=[],budget=new ResourceBudget({maxBytes:8*1024**2}),blur=new GPUImageEffects(budget),motion=new GPUMotionBlur(budget)
 const cap=gpuCapabilities.getReport();assert(cap.tier!=='none'&&cap.supportsInstancing,'WebGL instancing unavailable')
 const particles=new WebGLInstancedQuadBackend(cap,budget),oldParticles=new ReferenceParticles(cap)
 let oldBlurCanvas,oldMotionCanvas,motionCanvas,clipCanvas,small,deniedParticles,panelRoot
 const test=async(name,run)=>{await run();checks.push({name,passed:true});document.querySelector('#summary').textContent=`${checks.length} native checks passed`}
 try{
  for(const [w,h,radius]of [[96,64,1],[96,64,7],[128,64,12],[128,48,4]])await test(`Exact blur RGBA ${w}x${h} radius ${radius}`,()=>{
   const source=input(w,h);oldBlurCanvas=referenceBlur.blur(source,radius);assert(oldBlurCanvas,'Reference blur unavailable')
   const expected=pixels(oldBlurCanvas),actual=blur.blur(source,radius);assert(actual,'Managed blur unavailable');equal(expected,pixels(actual))
   if(radius===7){preview(oldBlurCanvas,'Reference GPU blur');preview(actual,'Managed GPU blur')}
   source.width=source.height=0
  })
  await test('Blur storage accounts two textures, canvas and quad',()=>assert(budget.getSnapshot().chargedBytes===128*48*12+48,'Incorrect effect store charge'))
  await test('Borrow survives same-job allocation pressure',()=>{
   const source=input();clipCanvas=blur.blur(source,4);source.width=source.height=0
   assert(budget.reserve('scratch',8*1024**2)===null,'Borrowed output was reclaimed before composition')
   assert(clipCanvas.width===96,'Borrowed output was cleared')
  })
  await test('Next-job pressure physically reclaims idle GPU stores',async()=>{
   await Promise.resolve();const ticket=budget.reserve('scratch',8*1024**2);assert(ticket,'Idle store was not reclaimed')
   assert(clipCanvas.width===0&&clipCanvas.height===0,'GPU canvas was not cleared');ticket.release()
  })
  await test('Reclaimed blur rebuilds with exact pixels',()=>{
   const source=input();oldBlurCanvas=referenceBlur.blur(source,4);equal(pixels(oldBlurCanvas),pixels(blur.blur(source,4)));source.width=source.height=0
  })
  await test('Admission refusal never becomes silent CSS fallback',()=>{
   small=new GPUImageEffects(new ResourceBudget({maxBytes:32}));const source=input();let refused=false
   try{small.blur(source,4)}catch(error){refused=error instanceof GpuAdmissionError}
   assert(refused,'Expected explicit GPU admission refusal');small.dispose();source.width=source.height=0
  })
  await test('Exact equal-weight motion blur RGBA',()=>{
   assert(referenceMotion.begin(96,64,3)&&motion.begin(96,64,3),'Motion backends unavailable')
   for(let i=0;i<3;i++){const source=input(96,64,i*4);referenceMotion.addSample(source);motion.addSample(source);source.width=source.height=0}
   oldMotionCanvas=referenceMotion.finish();const result=motion.finish();motionCanvas=result;assert(result&&oldMotionCanvas,'Motion output unavailable')
   equal(pixels(oldMotionCanvas),pixels(result));preview(result,'Managed motion blur')
  })
  await test('Streaming pass stays resident across idle grace and JS jobs',async()=>{
   assert(motion.begin(96,64,1),'Motion begin failed');await new Promise(resolve=>setTimeout(resolve,2150))
   assert(budget.getSnapshot().protectedBytes>=96*64*12+48,'Streaming pass pin expired')
   const source=input();motion.addSample(source);assert(motion.finish(),'Pinned motion pass failed');source.width=source.height=0
  })
  await test('Invalid native sample cancels the whole motion pass',()=>{
   assert(motion.begin(96,64,1),'Motion begin failed');const wrong=input(32,32);motion.addSample(wrong)
   assert(motion.finish()===null,'Partial motion output was published');wrong.width=wrong.height=0
  })
  const cfg=buildEmitterLayer().particleEmitter
  const instances=[0,1,2].map(i=>{
   const p=new ParticleInstance({id:i,birthTimeMs:0,lifetimeMs:1000,basePosition:{x:18+i*20,y:22+i*8},baseSize:14,
    baseRotation:i*17,rotationVelocity:0,baseColor:{r:255-i*80,g:80+i*50,b:160,a:190},shape:'rect',seedPhase:0,positionTarget:{x:0,y:0}})
   p.currentPosition={x:18+i*20,y:22+i*8};p.currentScale=1;p.currentOpacity=.8;p.currentRotation=i*17;p.currentColor={r:255-i*80,g:80+i*50,b:160,a:190};return p
  })
  const params={instances,cfg,relativeTime:50,compositionW:96,compositionH:64,backingW:96,backingH:64,layerAlpha:1,
   displayTransform:{x:0,y:0,scaleX:1,scaleY:1,rotationDeg:0},anchorX:0,anchorY:0}
  await test('An empty backing does not poison the next valid particle draw',()=>{
   assert(!particles.draw({...params,backingW:0}),'Empty backing unexpectedly rendered')
   assert(particles.draw(params),'Valid draw stayed disabled after an empty backing')
  })
  await test('Particle VBO grows from actual demand with exact reference pixels',()=>{
   assert(oldParticles.draw(params)&&particles.draw(params),'Particle draw failed');equal(pixels(oldParticles.canvas),pixels(particles.canvas))
   preview(particles.canvas,'Managed particle output')
   const snapshot=new ProjectResourceMonitor({scene:emptyScene(),media:new Map(),isPlaying:false}).getSnapshot()
   const managed=snapshot.gpu.find(g=>g.backend==='WebGL2 particles'||g.backend==='WebGL1 particles')
   assert(managed&&managed.bufferBytes<1024&&managed.stagingBytes<1024,'Initial 50k particle capacity remains')
  })
  await test('Particle refusal is explicit before staging/VBO allocation',()=>{
   deniedParticles=new WebGLInstancedQuadBackend(cap,new ResourceBudget({maxBytes:16}));let refused=false
   try{deniedParticles.draw(params)}catch(error){refused=error instanceof GpuAdmissionError}
   assert(refused&&deniedParticles.canvas.width===0,'Particle admission was bypassed');deniedParticles.dispose()
  })
  await test('Particle idle reclamation and subsequent rebuild preserve pixels',async()=>{
   await Promise.resolve();budget.reclaimIdle();assert(particles.canvas.width===0,'Particle pixels retained after reclaim')
   assert(particles.draw(params),'Particle rebuild failed');equal(pixels(oldParticles.canvas),pixels(particles.canvas))
  })
  await test('Transient native upload failure releases stores without disabling the next frame',()=>{
   const gl=particles.canvas.getContext('webgl2')??particles.canvas.getContext('webgl'),original=gl.bufferSubData
   gl.bufferSubData=()=>{throw new Error('Injected transient upload failure')}
   try{assert(!particles.draw(params),'Failed upload published a successful frame')}
   finally{gl.bufferSubData=original}
   assert(particles.canvas.width===0,'Failed upload retained its storage')
   assert(particles.draw(params),'Transient upload failure permanently disabled the backend')
   equal(pixels(oldParticles.canvas),pixels(particles.canvas))
  })
  await test('Real context loss releases charges and restores lazily',async()=>{
   const source=input();clipCanvas=blur.blur(source,4)
   const gl=clipCanvas.getContext('webgl2')??clipCanvas.getContext('webgl'),extension=gl.getExtension('WEBGL_lose_context')
   assert(extension,'Context loss extension unavailable')
   await contextEvent(clipCanvas,'webglcontextlost',()=>extension.loseContext())
   assert(clipCanvas.width===0&&blur.blur(source,4)===null,'Lost context stayed resident/available')
   await new Promise(resolve=>setTimeout(resolve,150))
   await contextEvent(clipCanvas,'webglcontextrestored',()=>extension.restoreContext())
   assert(clipCanvas.width===0,'Restoration allocated outside admission')
   oldBlurCanvas=referenceBlur.blur(source,4);equal(pixels(oldBlurCanvas),pixels(blur.blur(source,4)));source.width=source.height=0
  })
  await test('Particle context loss clears stores and rebuilds exact pixels lazily',async()=>{
   const canvas=particles.canvas,gl=canvas.getContext('webgl2')??canvas.getContext('webgl'),extension=gl.getExtension('WEBGL_lose_context')
   assert(extension,'Particle context loss extension unavailable')
   await contextEvent(canvas,'webglcontextlost',()=>extension.loseContext())
   assert(particles.contextLost&&canvas.width===0&&!particles.draw(params),'Lost particle backend stayed live')
   await new Promise(resolve=>setTimeout(resolve,150))
   await contextEvent(canvas,'webglcontextrestored',()=>extension.restoreContext())
   assert(!particles.contextLost&&canvas.width===0,'Particle restore allocated eagerly')
   assert(particles.draw(params),'Restored particle draw failed');equal(pixels(oldParticles.canvas),pixels(canvas))
  })
  await test('Native loss cancels a pinned motion pass and permits a new generation',async()=>{
   assert(motion.begin(96,64,1),'Motion begin failed')
   const gl=motionCanvas.getContext('webgl2')??motionCanvas.getContext('webgl'),extension=gl.getExtension('WEBGL_lose_context')
   assert(extension,'Motion context loss extension unavailable')
   await contextEvent(motionCanvas,'webglcontextlost',()=>extension.loseContext())
   assert(motion.finish()===null&&motionCanvas.width===0,'Lost motion pass was published')
   await new Promise(resolve=>setTimeout(resolve,150))
   await contextEvent(motionCanvas,'webglcontextrestored',()=>extension.restoreContext())
   assert(motionCanvas.width===0&&motion.begin(96,64,1),'Motion generation failed to restore lazily')
   const source=input();motion.addSample(source);assert(motion.finish(),'Restored motion output missing');source.width=source.height=0
  })
  await test('Resource panel distinguishes effect passes, instances and texture stores',async()=>{
   oldParticles.dispose();oldParticles.canvas.width=oldParticles.canvas.height=0
   const snapshot=new ProjectResourceMonitor({scene:emptyScene(),media:new Map(),isPlaying:false}).getSnapshot()
   assert(snapshot.gpuTextureBytes>0,'GPU textures missing from known resources')
   document.querySelector('#panel').insertAdjacentHTML('beforebegin','<h2>Resource panel · captured at last draw</h2>')
   panelRoot=createRoot(document.querySelector('#panel'))
   // This is a deterministic QA snapshot, not a product scheduling policy.
   // One RAF does not guarantee a concurrent root has committed on a busy host.
   flushSync(()=>panelRoot.render(createElement(ComputeResourcesSection,{snapshot})))
   const text=document.querySelector('#panel').textContent
   assert(text.includes('Total effect passes')&&text.includes('Total instanced draws')&&text.includes('Texture stores'),'GPU panel labels are ambiguous')
  })
  await test('Idle grace releases all managed workspace charges',async()=>{
   await new Promise(resolve=>setTimeout(resolve,2200));assert(budget.getSnapshot().chargedBytes===0,'Idle GPU store remains charged')
   assert(particles.canvas.width===0&&clipCanvas.width===0,'Idle native backing stores remain allocated')
  })
  const report={status:'complete',checks,budget:budget.getSnapshot(),capability:{tier:cap.tier,renderer:cap.renderer},metadata:await(await fetch('gpu-sources.json')).json()}
  document.querySelector('#report').textContent=JSON.stringify(report,null,2)
  document.querySelector('#summary').textContent=`${checks.length}/${checks.length} native checks passed · exact RGBA comparisons · final managed charge 0`
  document.querySelector('#status').textContent='COMPLETE'
 }catch(error){document.querySelector('#status').textContent='ERROR';document.querySelector('#report').textContent=JSON.stringify({status:'failed',checks,error:String(error)},null,2);throw error}
 finally{blur.dispose();motion.dispose();particles.dispose();small?.dispose();deniedParticles?.dispose();oldParticles.dispose();oldParticles.canvas.width=oldParticles.canvas.height=0;releaseReference(oldBlurCanvas);releaseReference(oldMotionCanvas)}
}
void main().catch(error=>console.error(error))
