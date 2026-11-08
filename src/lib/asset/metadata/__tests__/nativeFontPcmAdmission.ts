import {FontAssetService} from '../../fonts/FontAssetService'
import {FontBinaryReader} from '../../fonts/input'
import {browserFontDecoder} from '../../fonts/browserFontDecoder'
import {OutlineFontService} from '../../../text/fonts/OutlineFontService'
import {fontTextToSplineData} from '../../../text/GlyphOutlineExtractor'
import {textToSplineData as legacyTextToSplineData} from 'legacy-outline-reference'
import {splineToPathDefinition} from '../../../spline/splineToPath'
import {buildPathOnCanvas} from '../../../geometry/PathCommand'
import {AudioAssetService} from '../../../audio/AudioAssetService'
import {nativeStereoSource} from '../../../audio/__tests__/nativeStereoSource'
import {deliveryGate,until,type AdmissionFixture} from './nativeAdmissionFixture'
import type {Asset} from '../../../types'

/** Actual FontFace/WOFF/outline and WebAudio/WAV paths. Legacy baseline is a
 * frozen pre-OPT28 converter; only copied coordinates/RGBA are compared, not IDs. */
export async function checkNativeFontPcmAdmission(f:AdmissionFixture) {
  const fontBlob=await(await fetch('native-font.woff')).blob(),source=f.source(fontBlob)
  const asset:Asset={id:'font',name:'Font',type:'font',url:source.url,metadata:{notes:'family: Brand',filesize:1}}
  let inputBytes=0
  const fonts=new FontAssetService({budget:f.budget,executor:f.executor,inputSource:new FontBinaryReader({budget:f.budget}),decoder:(input,signal)=>{
    inputBytes=input.data?.byteLength??0;return browserFontDecoder(input,signal)
  }})
  const outlines=new OutlineFontService({budget:f.budget,executor:f.executor})
  const context=new AudioContext({sampleRate:48000}),nativeDecode=context.decodeAudioData.bind(context)
  let decoded=0,admissionAtDecode=0
  context.decodeAudioData=data=>{decoded++;admissionAtDecode=f.budget.getSnapshot().categories.audio.reservedBytes;return nativeDecode(data)}
  const audio=new AudioAssetService({budget:f.budget,executor:f.executor,decodeReserveBytes:64,createContext:()=>context})
  const reference=new FontFace('native-font-reference',`url(${JSON.stringify(source.url)})`)
  try{
    const pin=f.pin(await fonts.acquire(asset)),alias=pin.value.alias
    f.test('FontFace receives bounded actual encoded input rather than trusting declared filesize',inputBytes===fontBlob.size&&inputBytes>0&&document.fonts.check(`36px "${alias}"`),{inputBytes})
    await reference.load();document.fonts.add(reference)
    const a=f.surface('Bounded ArrayBuffer FontFace'),b=f.surface('Original native URL FontFace reference')
    for(const [canvas,family] of [[a,alias],[b,reference.family]] as const){const ctx=canvas.getContext('2d')!;ctx.fillStyle='#e2e8f0';ctx.font=`36px "${family}"`;ctx.fillText('Chorono MW il 0123',8,44)}
    const ap=a.getContext('2d')!.getImageData(0,0,a.width,a.height).data,bp=b.getContext('2d')!.getImageData(0,0,b.width,b.height).data
    f.test('bounded font input preserves exact native URL-reference glyph RGBA',ap.every((value,i)=>value===bp[i])&&ap.some(value=>value>0))
    pin.release();fonts.clearIdle()
    f.test('native font disposal releases both encoded backing and registration',fonts.getSnapshot().residency.chargedBytes===0&&!Array.from(document.fonts).some(face=>face.family===alias))
    const current=await outlines.withFont(source.url,font=>fontTextToSplineData(font,'ABO',48)),legacy=await legacyTextToSplineData('ABO',48,source.url)
    if(!current||!legacy)throw new Error('Native WOFF outline conversion produced no glyphs')
    const currentPath=splineToPathDefinition(current),legacyPath=splineToPathDefinition(legacy)
    f.test('bounded lazy outline parser preserves exact frozen-reference glyph geometry',JSON.stringify(currentPath)===JSON.stringify(legacyPath))
    const c=f.surface('Editable spline glyphs · centered pixels'),ctx=c.getContext('2d')!;ctx.translate(160,32);ctx.fillStyle='#60a5fa'
    ctx.beginPath();buildPathOnCanvas(ctx,currentPath);ctx.fill('nonzero')
    const referenceCanvas=document.createElement('canvas');referenceCanvas.width=320;referenceCanvas.height=64
    const rc=referenceCanvas.getContext('2d')!;rc.translate(160,32);rc.fillStyle='#60a5fa';rc.beginPath();buildPathOnCanvas(rc,legacyPath);rc.fill('nonzero')
    const cp=ctx.getImageData(0,0,320,64).data,rp=rc.getImageData(0,0,320,64).data
    f.test('copied editable outline contours preserve exact frozen-reference RGBA',cp.every((v,i)=>v===rp[i])&&Object.keys(current.points).length>0)
    outlines.clearIdle();f.test('outline idle cleanup releases retained parsed and encoded owners',outlines.getSnapshot().residency.chargedBytes===0&&f.budget.getSnapshot().categories.input.entries===0)
    const gate=deliveryGate();let nativeReady=false
    const delayed=new FontAssetService({budget:f.budget,executor:f.executor,inputSource:new FontBinaryReader({budget:f.budget}),decoder:(input,signal)=>{
      const native=browserFontDecoder(input,signal);return {alias:native.alias,dispose:()=>native.dispose(),ready:native.ready.then(async()=>{nativeReady=true;await gate.promise})}
    }})
    const abort=new AbortController(),pending=delayed.acquire(asset,{signal:abort.signal}).then(pin=>{pin.release();return false},error=>error.name==='AbortError')
    try{
      await until(()=>nativeReady);abort.abort()
      f.test('cancelled font retains encoded backing across post-native delivery gate',await pending&&f.budget.getSnapshot().categories.input.residentBytes===fontBlob.size&&delayed.getSnapshot().preparation.active===1)
      gate.release();await until(()=>delayed.getSnapshot().preparation.active===0)
      f.test('late cancelled font releases binary and native ownership after delivery settles',delayed.getSnapshot().residency.chargedBytes===0&&f.budget.getSnapshot().categories.input.entries===0)
    }finally{gate.release();delayed.dispose()}
    const wav=f.source(nativeStereoSource()),pcm=f.pin(await audio.acquireUrl(wav.url))
    f.test('native WAV decoder receives admitted Float32 output at actual context sample rate',decoded===1&&admissionAtDecode===2401*2*4,{admissionAtDecode,contextRate:context.sampleRate})
    const sampleA=pcm.buffer.getChannelData(0)[0],sampleB=pcm.buffer.getChannelData(1)[0]
    // The original native decoder is the independent PCM reference. Chrome's
    // positive int16 normalization gives 0.5000152588 here, not exactly 0.5.
    // Compare every actual sample exactly and source amplitude within one int16
    // quantization step; no production audio is changed to satisfy this check.
    const referencePcm=await nativeDecode(await nativeStereoSource().arrayBuffer())
    const exact=[0,1].every(channel=>pcm.buffer.getChannelData(channel).every((sample,i)=>sample===referencePcm.getChannelData(channel)[i]))
    f.test('exact native-reference stereo PCM and one-LSB source quantization are preserved',pcm.buffer.length===2400&&pcm.buffer.numberOfChannels===2&&exact&&Math.abs(sampleA-0.5)<=1/32767&&Math.abs(sampleB+0.5)<=1/32767,
      {length:pcm.buffer.length,channels:pcm.buffer.numberOfChannels,sampleA,sampleB,rate:pcm.buffer.sampleRate,exactReference:exact})
    pcm.release();audio.clearIdle()
    const smallContext=new AudioContext({sampleRate:48000}),smallDecode=smallContext.decodeAudioData.bind(smallContext)
    let smallStarts=0
    smallContext.decodeAudioData=data=>{smallStarts++;return smallDecode(data)}
    const small=new AudioAssetService({budget:f.budget,executor:f.executor,maxBytes:10000,decodeReserveBytes:64,createContext:()=>smallContext})
    try{
      let refused=false;try{await small.acquireUrl(wav.url)}catch(error){refused=error instanceof RangeError}
      f.test('known PCM oversize is rejected before native decode, without an untracked retry',refused&&smallStarts===0&&decoded===1&&small.getMemorySnapshot().residency!.chargedBytes===0)
    }finally{await small.dispose()}
  }finally{fonts.dispose();outlines.dispose();audio.clearIdle();await audio.dispose();document.fonts.delete(reference)}
}
