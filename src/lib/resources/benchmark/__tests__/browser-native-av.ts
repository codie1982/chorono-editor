import {emptyScene,newAudioLayer,newVideoLayer} from '@/lib/defaults'
import {assetSourcePool} from '@/lib/asset/sources'
import {VisualMediaSession} from '@/lib/render/media/VisualMediaSession'
import {videoForLayer} from '@/lib/asset/visual/AssetElementMap'
import {visualAssetService} from '@/lib/asset/visual'
import {CanvasRenderer} from '@/lib/render/CanvasRenderer'
import {syncVideoPlayback} from '@/app/hooks/useVideoPlaybackSync'
import {AudioEngine} from '@/lib/audioEngine'
import {getAudioAssetService} from '@/lib/audio/AudioAssetService'
import {PlaybackClock,playbackWindow} from '@/lib/timeline/playbackClock'
import {editorResourceBudget} from '@/lib/resources/budget'
import {until} from '@/lib/resources/testing/nativeSettlement'
import {seekNativeVideo} from '@/lib/asset/visual/__tests__/nativeMediaFixtures'
import {summarizeNumbers} from '@/lib/resources/performance/sampleStatistics'

interface PresentedSample {phase:string;clip:string;mediaTime:number;outputCompositionSec:number;errorMs:number}

/** Native editor transport acceptance. Uses the exact core owners used by
 * useAudioEngine/useVideoPlaybackSync/viewport, not an invented SDK audio backend.
 * Video observations are actual compositor metadata; audio timing uses native
 * getOutputTimestamp plus the real scheduled source anchor, with nonzero native
 * analyser output required. This cannot measure physical speaker/display latency.
 * A finite 4 s FFmpeg-generated input is prepared before timing; no mic/camera.
 */
async function main():Promise<void>{
  document.body.innerHTML='<h1>Native editor A/V acceptance</h1><p>Actual presented video and native audio output clock; quiet non-silent tone.</p><button id="start">Start native A/V</button><p id="status">Ready</p><div id="view"></div><pre id="summary"></pre><pre id="report" hidden></pre>'
  const status=document.querySelector('#status')!,button=document.querySelector('#start') as HTMLButtonElement
  button.onclick=async()=>{
    button.disabled=true;status.textContent='Preparing native media'
    const checks:{name:string;passed:boolean;details?:unknown}[]=[],samples:PresentedSample[]=[]
    const service=getAudioAssetService(),context=service.getContext(),engine=new AudioEngine(service)
    const media=new VisualMediaSession(),renderer=new CanvasRenderer(),sources:ReturnType<typeof assetSourcePool.create>[]=[]
    const callbacks=new Map<HTMLVideoElement,number>(),canvas=document.createElement('canvas')
    canvas.width=160;canvas.height=64;document.querySelector('#view')!.append(canvas)
    const ctx=canvas.getContext('2d')!,clock=new PlaybackClock(playbackWindow({maxDuration:12000,wrapAtEnd:false}))
    const scene=emptyScene();Object.assign(scene.composition,{width:160,height:64,durationMs:12000})
    let phase='',phaseStart=0,anchor:{startsAt:number;transportSec:number}|null=null,peak=0,error:unknown=null
    const reference=document.createElement('video');reference.muted=true

    /** Fail with evidence; threshold is fixed before native execution. */
    function check(name:string,passed:boolean,details?:unknown){
      checks.push({name,passed,details});if(!passed)throw new Error(name)
    }

    /** Borrow current scoped elements; rendering performs the normal demand diff. */
    function draw(){renderer.render(ctx,scene,clock.timeMs,null,media.elements(),{renderMode:'preview'})}

    /** Production transport reconciliation, followed by actual scheduled anchor capture. */
    function tick(now:number){
      clock.sample(now)
      const assets=media.elements()
      syncVideoPlayback({scene,assetCache:assets,currentTimeMs:clock.timeMs,isPlaying:clock.playing,playbackSpeed:clock.speed})
      engine.syncToTime(scene,clock.timeMs,clock.playing,clock.speed)
      const state=engine.getState(),source=state.sources[0]
      if(source&&anchor?.startsAt!==source.startsAtContextSec)anchor={startsAt:source.startsAtContextSec,transportSec:clock.timeMs/1000}
      peak=Math.max(peak,state.meter.peak);draw()
    }

    /** Observe native frames without changing their transport; retain numeric rows only. */
    function observe(video:HTMLVideoElement,clip:string,offsetSec:number){
      const callback=(_now:number,metadata:VideoFrameCallbackMetadata)=>{
        if(phase&&anchor&&performance.now()-phaseStart>150&&samples.length<2000){
          const stamp=context.getOutputTimestamp()
          if(stamp.performanceTime&&stamp.contextTime!==undefined){
            const outputCtx=stamp.contextTime+(metadata.expectedDisplayTime-stamp.performanceTime)/1000
            const composition=anchor.transportSec+(outputCtx-anchor.startsAt)*clock.speed
            const duration=video.duration,expected=((composition+offsetSec)%duration+duration)%duration
            const distance=Math.abs(metadata.mediaTime-expected)
            samples.push({phase,clip,mediaTime:metadata.mediaTime,outputCompositionSec:composition,
              errorMs:1000*Math.min(distance,Math.abs(duration-distance))})
          }
        }
        callbacks.set(video,video.requestVideoFrameCallback(callback))
      }
      callbacks.set(video,video.requestVideoFrameCallback(callback))
    }

    /** Three seconds of real RAF transport per rate/seek phase; no synthetic time jump. */
    async function playPhase(name:string,timeMs:number,rate:number){
      phase='';clock.seek(timeMs,performance.now());clock.setSpeed(rate,performance.now());anchor=null
      clock.play(performance.now());phase=name;phaseStart=performance.now()
      status.textContent=`Playing ${name}`
      await new Promise<void>((resolve,reject)=>{
        const frame=(now:number)=>{try{
          tick(now)
          if(document.hidden)throw new Error('Native A/V document became hidden')
          if(editorResourceBudget.getSnapshot().chargedBytes>512*1024**2)throw new Error('A/V policy guard')
          if(now-phaseStart>=3000)resolve();else requestAnimationFrame(frame)
        }catch(e){reject(e)}};requestAnimationFrame(frame)
      })
      phase='';clock.pause(performance.now());tick(performance.now())
      for(const clip of ['a','b']){
        const values=samples.filter(row=>row.phase===name&&row.clip===clip).map(row=>row.errorMs)
        const distribution=summarizeNumbers(values)
        check(`${name} clip ${clip}: presented frames track native audio output within 150 ms`,
          values.length>=20&&(distribution?.p95??Infinity)<=150,distribution)
      }
    }

    try{
      await context.resume()
      const blobs=await Promise.all(['native-sync.webm','native-sync.wav'].map(async file=>{
        const response=await fetch(file);if(!response.ok)throw new Error(`Missing native fixture ${file}`);return response.blob()
      }))
      blobs.forEach(blob=>sources.push(assetSourcePool.create(blob)))
      scene.assets=[{id:'movie',name:'Native sync video',type:'video',url:sources[0].url,width:64,height:64,durationMs:4000},
        {id:'tone',name:'Native quiet sine',type:'audio',url:sources[1].url,durationMs:4000}]
      const a=newVideoLayer('movie',64,64,12000),b=newVideoLayer('movie',64,64,12000),audio=newAudioLayer('tone',12000)
      a.id='a';b.id='b';audio.id='sound';a.transform.x=32;a.transform.y=32;b.transform.x=112;b.transform.y=32
      a.video={assetId:'movie',muted:true,loop:true};b.video={assetId:'movie',muted:true,loop:true,startOffsetMs:1000}
      audio.transform.x=10000;audio.audio={assetId:'tone',loop:true,volume:0.15}
      scene.layers=[a,b,audio];media.start(draw);draw();await engine.setAssets(scene.assets)
      await until(()=>['a','b'].every(id=>(videoForLayer(media.elements(),id,'movie')?.readyState??0)>=2),{label:'Two actual native clip decoders'})
      const videos=['a','b'].map(id=>videoForLayer(media.elements(),id,'movie')!)
      check('two clips of one source own independent native video elements',videos[0]!==videos[1])
      check('actual finite 4 s video metadata',videos.every(video=>Math.abs(video.duration-4)<0.1),videos.map(video=>video.duration))
      videos.forEach((video,i)=>observe(video,i?'b':'a',i?1:0))
      await playPhase('normal',0,1)
      clock.seek(2000,performance.now());tick(performance.now())
      await until(()=>videos.every((video,i)=>!video.seeking&&Math.abs(video.currentTime-(i?3:2))<0.001),{label:'Actual paused seeks'})
      reference.src=sources[0].url;reference.load();await until(()=>reference.readyState>=2,{label:'Reference native decode'})
      const pixels=document.createElement('canvas');pixels.width=pixels.height=64;const pc=pixels.getContext('2d')!
      for(let i=0;i<2;i++){
        await seekNativeVideo(reference,i?3:2);pc.drawImage(reference,0,0,64,64)
        const expected=pc.getImageData(0,0,64,64).data;pc.drawImage(videos[i],0,0,64,64)
        const actual=pc.getImageData(0,0,64,64).data
        check(`paused seek clip ${i}: actual decoded RGBA equals native reference`,actual.every((value,index)=>value===expected[index]))
      }
      pixels.width=pixels.height=0
      await playPhase('seek-and-rate-2',6000,2)
      check('offscreen audio produced actual non-silent analyser samples',peak>0.001,{peak})
      check('native audio output clock is running',context.state==='running'&&samples.length>=80,{samples:samples.length,state:context.state})
    }catch(e){error=String(e)}finally{
      phase='';callbacks.forEach((id,video)=>video.cancelVideoFrameCallback(id));callbacks.clear()
      engine.dispose();media.stop();reference.pause();reference.removeAttribute('src');reference.load()
      sources.forEach(source=>source.release());visualAssetService.clearIdle();service.clearIdle();editorResourceBudget.reclaimIdle()
      try{
        await until(()=>visualAssetService.getSnapshot().preparation.active===0&&visualAssetService.getSnapshot().preparation.queued===0)
      }catch(cleanupError){error=`${error??''} Native cleanup: ${String(cleanupError)}`}
      visualAssetService.clearIdle();service.clearIdle();editorResourceBudget.reclaimIdle()
      const final={budget:editorResourceBudget.getSnapshot(),sources:assetSourcePool.getSnapshot()}
      checks.push({name:'native transport disposal releases source pins and protected policy',passed:final.budget.protectedBytes===0&&final.sources.references===0,details:final})
      const report={kind:'native-editor-av',passed:!error&&checks.every(row=>row.passed),error,checks,samples,peak,final,
        scope:'Production editor media/audio/transport cores. Actual rVFC mediaTime plus getOutputTimestamp/scheduled source anchor. First 150 ms per phase excluded from steady drift; paused seek separately verifies actual RGBA. Not physical speaker latency or SDK ChronoPlayer audio support.',
        environment:{userAgent:navigator.userAgent,visibility:document.visibilityState},build:await(await fetch('native-av-sources.json')).json()}
      document.querySelector('#report')!.textContent=JSON.stringify(report,null,2)
      document.querySelector('#summary')!.textContent=JSON.stringify({passed:report.passed,error,checks:checks.map(({name,passed})=>({name,passed})),samples:samples.length},null,2)
      status.textContent=report.passed?'PASS':'FAIL'
    }
  }
}
void main()
