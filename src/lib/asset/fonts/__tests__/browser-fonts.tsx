import {StrictMode,useLayoutEffect,useMemo,useRef} from 'react'
import {createRoot} from 'react-dom/client'
import {flushSync} from 'react-dom'
import {FontAssetService,fontAssetService} from '../FontAssetService'
import {browserFontDecoder} from '../browserFontDecoder'
import {VisualAssetService} from '../../visual'
import {ResourceBudget} from '../../../resources/budget'
import {emptyScene,newTextLayer} from '../../../defaults'
import type {Asset,ChronoScene} from '../../../types'
import {VisualMediaSession} from '../../../render/media/VisualMediaSession'
import {withMediaFrame} from '../../../render/media/withMediaFrame'
import {projectFrameFonts,projectFrameFontOverrides} from '../../../render/media/projectFrameFonts'
import {hitTestLayer} from '../../../renderer'
import {canvasRenderer} from '../../../render/CanvasRenderer'
import {prepareRenderFrame} from '../../../render/prepareRenderFrame'
import {createLayerWorldBoundsResolver} from '../../../geometry/resolveLayerWorldBounds'
import {measureTextLayout} from '../../../text/measureText'
import {exportRasterImage} from '../../../export/raster/RasterExportEngine'
import {FontHandler} from '../../../import/handlers/asset/FontHandler'
import {releaseImportSources} from '../../../import/resources/importSources'
import {ProjectResourceMonitor} from '../../../resources/monitor/ProjectResourceMonitor'
import {MediaResourcesSection} from '@/components/resources/MediaResourcesSection'
import {ManagedBudgetSection} from '@/components/resources/ManagedBudgetSection'
import {useAssetCache,type AssetCache} from '@/app/hooks/useAssetCache'
import {useCanvasRenderer} from '@/components/canvas/hooks/useCanvasRenderer'

interface Fixture {name:string;url:string;size:number}
interface Binding {cache:AssetCache;canvas?:HTMLCanvasElement}
/** Actual managed viewport hook/renderer. StrictMode mount replay must not leak
 * a registration or publish an obsolete consumer's alias. */
function Probe({scene,fonts,binding}:{scene:ChronoScene;fonts:FontAssetService;binding:Binding}){
 const cache=useAssetCache(scene.assets,{managed:true,fontService:fonts}),canvas=useRef<HTMLCanvasElement>(null)
 const overrides=useMemo(()=>new Map(),[scene])
 useLayoutEffect(()=>{binding.cache=cache;binding.canvas=canvas.current!},[cache,binding])
 useCanvasRenderer(canvas,{scene,timeMs:0,assets:cache,selectedLayerId:null,overrides,dragOverrides:new Map(),snapEnabled:false,snapToGridOn:false,gridSize:10,hideEditorUI:true})
 return <canvas ref={canvas} width={640} height={100} style={{width:640,height:100}}/>
}
/** Poll observable state, never assume native/font or React work finishes after one RAF. */
async function until(condition:()=>boolean){const end=performance.now()+20000;while(!condition()){if(performance.now()>end)throw new Error('Font acceptance timed out');await new Promise(requestAnimationFrame)}}
function sceneFor(asset:Asset):ChronoScene{
 const scene=emptyScene(),text=newTextLayer();text.id='glyph';text.text={...text.text!,value:'Chorono MW il 0123',fontFamily:'Brand',fontSize:36,color:'#e2e8f0'}
 text.transform={...text.transform,x:16,y:20,anchorX:0,anchorY:0};text.size={width:3,height:3}
 return {...scene,layers:[text],assets:[asset],composition:{...scene.composition,width:640,height:100,backgroundColor:'#0f172a'}}
}
/** Exact byte comparison is local to small native frames, not a perceptual score. */
function pixels(canvas:HTMLCanvasElement){return canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data}
function equal(a:Uint8ClampedArray,b:Uint8ClampedArray){return a.length===b.length&&a.every((v,i)=>v===b[i])}
function surface(){const c=document.createElement('canvas');c.width=640;c.height=100;return c}
/** Native QA fixture owns every private service/root/face through finally. No
 * test hooks or runtime source aliases are added to the application API/scene. */
async function run(probe:HTMLElement,panel:HTMLElement,copies:HTMLElement){
 const rows:Array<{name:string;passed:boolean;details?:unknown}>=[],test=(name:string,passed:boolean,details?:unknown)=>rows.push({name,passed,details})
 const fixtures:Fixture[]=await (await fetch('font-fixtures.json')).json(),budget=new ResourceBudget({maxBytes:8*1024**2})
 const registered:string[]=[],fonts=new FontAssetService({budget,maxBytes:8*1024**2,decoder:(input,signal)=>{registered.push(input.alias);return browserFontDecoder(input,signal)}})
 const visual=new VisualAssetService(),root=createRoot(probe),panelRoot=createRoot(panel),binding:Binding={cache:new Map()},faces:FontFace[]=[]
 const assets=fixtures.map((f,i):Asset=>({id:`font-${i}`,name:f.name,type:'font',url:f.url,metadata:{filesize:f.size,notes:'family: Brand'}}))
 const a=assets[0],b=assets[1],scene=sceneFor(a),source=JSON.stringify(scene),viewport=new VisualMediaSession(visual,fonts),other=new VisualMediaSession(visual,fonts),job=new VisualMediaSession(visual,fonts)
 try{
  flushSync(()=>root.render(<StrictMode><Probe scene={{...scene,assets:[a,{...b,metadata:{...b.metadata,notes:'family: Unused'}}]}} fonts={fonts} binding={binding}/></StrictMode>))
  await until(()=>binding.cache.fonts?.state(a)==='ready'&&fonts.getSnapshot().preparation.active===0)
  const alias=binding.cache.fonts!.resolveFamily('Brand',[a]),ctx=surface().getContext('2d')!
  test('actual managed viewport loads only the referenced native face',registered.length===1&&document.fonts.check(`36px ${alias}`))
  const reference=new FontFace('font-reference-a',`url(${JSON.stringify(a.url)})`);await reference.load();document.fonts.add(reference);faces.push(reference)
  const referenceScene={...scene,assets:[],layers:[{...scene.layers[0],size:undefined,text:{...scene.layers[0].text!,fontFamily:'font-reference-a'}}]}
  const expected=surface();canvasRenderer.render(expected.getContext('2d')!,referenceScene,0,null,new Map(),{renderMode:'preview'})
  await until(()=>equal(pixels(binding.canvas!),pixels(expected)))
  copies.append(expected);test('actual viewport preserves exact native reference glyph RGBA',true)
  const projected=projectFrameFonts(scene,binding.cache.fonts),bounds=createLayerWorldBoundsResolver(projected)(projected.layers[0])!
  const measured=measureTextLayout({...scene.layers[0].text!,fontFamily:alias})
  test('selection geometry uses the ready face rather than stale stored fallback size',bounds.width===measured.width&&bounds.width>3,{width:bounds.width,measured:measured.width})
  test('font picking reaches the measured right edge and rejects outside points',hitTestLayer(projected,0,16+measured.width-2,30)==='glyph'&&hitTestLayer(projected,0,16+measured.width+2,30)===null)
  test('runtime aliases never change source JSON, pivots or borrowed Map serialization',JSON.stringify(scene)===source&&projected.layers[0].transform===scene.layers[0].transform&&JSON.stringify(binding.cache)==='{}')
  viewport.start();other.start();job.start();viewport.request({frame:prepareRenderFrame(scene,0),context:ctx});await viewport.ready()
  const old=viewport.elements();other.request({frame:prepareRenderFrame(sceneFor(b),0),context:ctx});await other.ready()
  const otherAlias=other.elements().fonts!.resolveFamily('Brand',[b])
  test('two same-named font sources use distinct native family aliases',otherAlias!==alias&&document.fonts.check(`36px ${otherAlias}`))
  const second=surface();canvasRenderer.render(second.getContext('2d')!,sceneFor(b),0,null,other.elements(),{renderMode:'preview'});copies.append(second)
  test('different same-name source actually renders different glyph pixels',!equal(pixels(expected),pixels(second)))
  const rawOverride=new Map([['layers.glyph.text.fontFamily','Brand']]),converted=projectFrameFontOverrides(sceneFor(b),rawOverride,other.elements().fonts)
  const projectedB=projectFrameFonts(sceneFor(b),other.elements().fonts),animatedBounds=createLayerWorldBoundsResolver(projectedB,0,converted)(projectedB.layers[0])!
  test('animated font override keeps the same scoped native metrics',animatedBounds.width===measureTextLayout({...scene.layers[0].text!,fontFamily:otherAlias}).width&&rawOverride.get('layers.glyph.text.fontFamily')==='Brand')
  let release!:()=>void,entered=false;const held=new Promise<void>(yes=>{release=yes}),final=surface()
  const work=withMediaFrame(scene,0,final.getContext('2d')!,{},async(cache,overrides)=>{entered=true;await held;canvasRenderer.render(final.getContext('2d')!,scene,0,null,cache,{overrides,renderMode:'preview'});return equal(pixels(final),pixels(expected))},job)
  await until(()=>entered);flushSync(()=>root.render(null));viewport.stop();fonts.clear()
  test('viewport closes without releasing the independent final-job font pin',old.fonts!.state(a)==='notResident'&&job.elements().fonts!.state(a)==='ready')
  release();test('held final encode scope preserves exact glyph pixels after viewport/source changes',await work)
  job.stop();other.stop();fonts.clearIdle();test('all private native registrations and policy charges are reclaimed',budget.getSnapshot().chargedBytes===0&&registered.every(alias=>!Array.from(document.fonts).some(face=>face.family===alias)))
  const raster=await exportRasterImage(scene,new Map(),{format:'png',timeMs:0}),bitmap=await createImageBitmap(raster.blob),decoded=surface();decoded.getContext('2d')!.drawImage(bitmap,0,0);bitmap.close()
  test('actual PNG export prepares its own cold font and preserves exact RGBA',equal(pixels(decoded),pixels(expected)))
  fontAssetService.clearIdle();test('actual raster completion releases the default font lease',fontAssetService.getSnapshot().residency.chargedBytes===0)
  const defaultPin=await fontAssetService.acquire(a),rawBounds=createLayerWorldBoundsResolver(scene)(scene.layers[0])!
  test('raw editor metrics lookup uses explicit asset scope without starting another load',rawBounds.width===measured.width);defaultPin.release();fontAssetService.clearIdle()
  const fontFile=await (await fetch(a.url)).blob(),imported=await new FontHandler().handle(new File([fontFile],'字体.woff',{type:'font/woff'}))
  const importedAsset=imported.assets[0];test('font import validates through managed service with a nonempty stable family',imported.warnings.length===0&&!!importedAsset.metadata?.notes?.includes('ImportedFont_'))
  releaseImportSources(imported);fontAssetService.clearIdle();await Promise.resolve();test('discarding imported font releases its source and native registration',fontAssetService.getSnapshot().residency.chargedBytes===0&&!(await fetch(importedAsset.url).then(()=>true,()=>false)))
  const bad={...a,id:'bad',url:'data:font/woff;base64,bm90IGEgZm9udA=='},failure=new VisualMediaSession(visual,fonts);failure.start();failure.request({frame:prepareRenderFrame(sceneFor(bad),0),context:ctx})
  let failed=false;try{await failure.ready()}catch{failed=true}failure.stop();fonts.clearIdle();test('required native font failure rejects final readiness without fallback success',failed&&budget.getSnapshot().chargedBytes===0)
  flushSync(()=>root.render(<Probe scene={scene} fonts={fonts} binding={binding}/>));await until(()=>binding.cache.fonts?.state(a)==='ready')
  const monitor=new ProjectResourceMonitor({scene,media:binding.cache,isPlaying:false},{fonts,budget}),snapshot=monitor.getSnapshot()
  flushSync(()=>panelRoot.render(<><MediaResourcesSection snapshot={snapshot} query={{page:0,search:''}} onQuery={()=>{}}/><ManagedBudgetSection snapshot={snapshot.budget}/></>))
  test('real panel reports ready fonts and opaque memory separately from policy charges',snapshot.media.rows[0].state==='ready'&&snapshot.media.rows[0].bytes===null&&snapshot.fonts.residency.protectedBytes>0&&panel.textContent!.includes('Font admission · policy charge / limit')&&panel.textContent!.includes('Memory size unknown'))
  flushSync(()=>root.render(null));fonts.clearIdle()
  return {passed:rows.every(row=>row.passed),results:rows,final:fonts.getSnapshot(),budget:budget.getSnapshot(),environment:{userAgent:navigator.userAgent,width:innerWidth,height:innerHeight,dpr:devicePixelRatio}}
 }catch(error){return {passed:false,error:String(error),results:rows,at:rows.length,fonts:fonts.getSnapshot(),budget:budget.getSnapshot()}}
 finally{root.unmount();const panelMarkup=panel.innerHTML;panelRoot.unmount();panel.innerHTML=panelMarkup;viewport.stop();other.stop();job.stop();fonts.dispose();visual.dispose();fontAssetService.clearIdle();faces.forEach(face=>document.fonts.delete(face))}
}

const app=document.getElementById('app')!;app.style.cssText='background:#080d19;color:#e2e8f0;font:14px system-ui;padding:24px;min-height:100vh'
app.innerHTML='<h1>Font ownership · native acceptance</h1><p>Real WOFF · scoped aliases · exact glyph RGBA · geometry · independent final pins · import · panel</p><button>Run native checks</button><p id="font-status" role="status">Ready</p><div id="probe"></div><div id="copies" style="display:flex;flex-wrap:wrap;gap:12px"></div><p>Native font/glyph memory is opaque. Admission policy charges are reported separately from known resource bytes.</p><pre id="font-report" style="white-space:pre-wrap"></pre><div id="panel"></div>'
const button=app.querySelector('button')!,status=document.getElementById('font-status')!,report=document.getElementById('font-report')!
button.onclick=async()=>{button.disabled=true;status.textContent='Running';document.getElementById('copies')!.replaceChildren();try{const result=await run(document.getElementById('probe')!,document.getElementById('panel')!,document.getElementById('copies')!);report.textContent=JSON.stringify(result,null,2);status.textContent=result.passed?'PASS':'FAIL'}catch(error){report.textContent=JSON.stringify({passed:false,error:String(error)},null,2);status.textContent='FAIL'}finally{button.disabled=false}}
