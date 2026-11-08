import {MediaProbeService} from '../MediaProbeService'
import {ImageMetadataReader} from '../ImageMetadataReader'
import {VisualAssetService} from '../../visual/VisualAssetService'
import {browserVisualDecoder} from '../../visual/browserVisualDecoder'
import {nativePng,nativeWebm} from '../../visual/__tests__/nativeMediaFixtures'
import {staticGif} from '../../../import/gif/__tests__/gifFixtures'
import {readGifMetadata} from '../../../import/gif/readGifMetadata'
import {resolveGifLimits} from '../../../import/gif/types'
import {browserGifStaticProbe} from '../../../import/gif/browserGifStaticProbe'
import {nativeStereoSource} from '../../../audio/__tests__/nativeStereoSource'
import {pngHeader} from './imageHeaders'
import {deliveryGate,until,type AdmissionFixture} from './nativeAdmissionFixture'

/** Real native codecs plus production header/admission adapters. Oversize
 * fixtures are header-only so the test never allocates their claimed pixels. */
export async function checkNativeImageAdmission(f:AdmissionFixture) {
  let starts=0
  const probes=new MediaProbeService({budget:f.budget,executor:f.executor,imageDecoder:(input,signal)=>{starts++;return browserVisualDecoder(input,signal)}})
  const png=new File([await nativePng()],'source.png',{type:'image/png'})
  const pin=f.pin(await probes.preview(png)),canvas=f.surface('Owned native PNG · exact source colors',128,128)
  canvas.getContext('2d')!.drawImage(pin.element,0,0,128,128)
  const rgba=canvas.getContext('2d')!.getImageData(0,0,128,128).data,center=(64*128+64)*4
  f.test('native PNG preview preserves independent orange/blue reference pixels',rgba[0]===236&&rgba[1]===121&&rgba[2]===38&&rgba[center]===40&&rgba[center+1]===75&&rgba[center+2]===210)
  f.test('one native preview is protected until explicit release',probes.getSnapshot().residency.protectedBytes===4096&&pin.element instanceof HTMLImageElement)
  pin.release();f.test('native preview release drops its transient charge',probes.getSnapshot().residency.chargedBytes===0)
  for(const mime of ['image/jpeg','image/webp']){
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('QA image encoding failed')),mime))
    if(blob.type!==mime)throw new Error(`Native ${mime} fixture encoding unavailable`)
    const result=await probes.image(new File([blob],`source.${mime.split('/')[1]}`,{type:mime}))
    f.test(`${mime} header agrees with actual native display dimensions`,result.width===128&&result.height===128)
  }
  const gif=new File([staticGif()],'static.gif',{type:'image/gif'})
  const info=await probes.image(gif);await browserGifStaticProbe(gif,readGifMetadata(staticGif().buffer,resolveGifLimits()))
  f.test('GIF shared logical screen and existing static native probe remain compatible',info.width===4&&info.height===4)
  const before=starts,huge=new File([pngHeader(32768,32768)],'oversize.png',{type:'image/png'})
  let denied=false;try{await probes.image(huge)}catch(error){denied=error instanceof RangeError}
  f.test('huge supported header is refused before creating any native image',denied&&starts===before)
  const malformed=pngHeader(32,32);malformed[29]^=1
  let corrupt=false;try{await probes.image(new File([malformed],'corrupt.png'))}catch(error){corrupt=String(error).includes('checksum')}
  f.test('bad supported header never falls back to native decode',corrupt&&starts===before)
  const source=f.source(huge),headers=new ImageMetadataReader({budget:f.budget})
  const visual=new VisualAssetService({budget:f.budget,executor:f.executor,imageMetadata:headers,decoder:(input,signal)=>{starts++;return browserVisualDecoder(input,signal)}})
  try{
    let refused=false,failure:unknown;try{await visual.acquire({id:'tiny-authored',name:'tiny-authored',type:'image',url:source.url,width:1,height:1})}catch(error){failure=String(error);refused=error instanceof RangeError}
    f.test('viewport ignores undersized authored dimensions and refuses before native construction',refused&&starts===before,{failure,starts,before})
  }finally{visual.dispose()}
  let opaqueCharge=0
  const opaque=new MediaProbeService({budget:f.budget,executor:f.executor,imageDecoder:(input,signal)=>{
    opaqueCharge=f.budget.getSnapshot().chargedBytes;return browserVisualDecoder(input,signal)
  }})
  const svg=new File(['<svg xmlns="http://www.w3.org/2000/svg" width="8" height="6"><rect width="8" height="6" fill="red"/></svg>'],'opaque.svg',{type:'image/svg+xml'})
  const svgInfo=await opaque.image(svg)
  f.test('opaque SVG uses explicit 64 MiB policy before actual native geometry is known',svgInfo.width===8&&svgInfo.height===6&&opaqueCharge===64*1024**2,{opaqueCharge})
  const video=await probes.video(new File([await nativeWebm()],'native.webm',{type:'video/webm'}))
  f.test('real metadata-only WebM reports bounded native frame dimensions',video.width===32&&video.height===32,{durationMs:video.durationMs})
  const audio=await probes.audio(new File([nativeStereoSource()],'click.wav',{type:'audio/wav'}))
  f.test('metadata-only native WAV preserves a legitimate 50ms effect',audio.durationMs===50,audio)
  const abort=new AbortController();let actualSettled=false
  const cancelled=new MediaProbeService({budget:f.budget,executor:f.executor,imageDecoder:(input,signal)=>{
    const native=browserVisualDecoder(input,signal);abort.abort()
    return {element:native.element,get width(){return native.width},get height(){return native.height},dispose:()=>native.dispose(),
      ready:native.ready.finally(()=>{actualSettled=true})}
  }})
  let aborted=false;try{await cancelled.preview(png,{signal:abort.signal})}catch(error){aborted=error instanceof Error&&error.name==='AbortError'}
  f.test('real Image.decode cancellation settles before probe releases its slot and charge',aborted&&actualSettled&&cancelled.getSnapshot().residency.chargedBytes===0&&cancelled.getSnapshot().preparation.active===0)
  const gate=deliveryGate();let nativeReady=false
  const delayed=new MediaProbeService({budget:f.budget,executor:f.executor,imageDecoder:(input,signal)=>{
    const native=browserVisualDecoder(input,signal)
    return {element:native.element,get width(){return native.width},get height(){return native.height},dispose:()=>native.dispose(),
      ready:native.ready.then(async()=>{nativeReady=true;await gate.promise})}
  }})
  const cancel=new AbortController(),pending=delayed.preview(png,{signal:cancel.signal}).then(pin=>{pin.release();return false},error=>error.name==='AbortError')
  try{
    await until(()=>nativeReady);cancel.abort()
    f.test('post-native delivery gate retains charge and shared slot after cancellation',delayed.getSnapshot().residency.chargedBytes===4096&&f.executor.getSnapshot().active===1)
    gate.release();f.test('cancelled late preview is discarded at actual delivery settlement',await pending&&delayed.getSnapshot().residency.chargedBytes===0)
  }finally{gate.release();await pending}
  probes.clearIdle();opaque.clearIdle();delayed.clearIdle();cancelled.clearIdle()
  return {png,probes}
}
