import { assetSourcePool } from '../asset/sources'
import type { ChronoScene } from '../types'
import { ChronoPlayer } from '../player/ChronoPlayer'
import { audibleAudioLayers, buildAudioClipSchedule } from './audioEvaluation'
import { acquireAudioBuffer, type AudioPcmLease } from './AudioAssetService'
import { dbToGain, gainToDb, resolveAudioClipWindow } from './audioClip'
import { encodeWav, measurePCM, sourceRangePeak,wavByteLength } from './wav'
import {editorOutputResources,type OutputResources,type OutputScope} from '../export/resources'
import {OfflineAudioGraph} from './render/OfflineAudioGraph'
import type {ResourceLease} from '../resources/residency'

export interface AudioRenderOptions {
  startMs?: number
  durationMs?: number
  timelineIds?: string[]
  sampleRate?: 44100 | 48000
  maxDurationMs?: number
}

/** Acquire an owned offline WAV result. Native context/output, encode bytes
 * and source PCM stay admitted through actual rendering; final bytes remain
 * charged until the consumer releases this result. No output-quality change.
 */
export function acquireAudioMix(scene:ChronoScene,options:AudioRenderOptions={},
  execution:{signal?:AbortSignal;resources?:OutputResources}={}):Promise<ResourceLease<AudioMixResult>>{
  return assetSourcePool.withAssets(scene.assets,()=>
    (execution.resources??editorOutputResources).run((scope,signal)=>renderAudioMixInScope(scene,options,scope,signal),execution))
}

export interface AudioMixResult{
  bytes:Uint8Array<ArrayBuffer>;mimeType:'audio/wav';startMs:number;durationMs:number
  sampleRate:number;channels:number;frames:number;stats:ReturnType<typeof measurePCM>;warnings:string[]
  clips:{layerId:string;sourceOffsetSec:number;startSec:number;durationSec:number}[]
}

/** Composed output step; caller supplies an already admitted output job/scope.
 * Source/native context seconds and authored composition milliseconds preserve
 * the existing schedule. Context policy includes one PCM frame store plus graph
 * metadata; actual returned Float32 PCM and exact WAV allocation are separate.
 */
export async function renderAudioMixInScope(scene:ChronoScene,options:AudioRenderOptions,scope:OutputScope,signal?:AbortSignal):Promise<AudioMixResult>{
  scope.check(signal)
  const startMs=options.startMs??0,durationMs=options.durationMs??scene.composition.durationMs-startMs,sampleRate=options.sampleRate??48000
  if(!Number.isFinite(startMs)||startMs<0||!Number.isFinite(durationMs)||durationMs<=0
    ||durationMs>(options.maxDurationMs??120000)||![44100,48000].includes(sampleRate))throw new Error('Invalid audio range; use a positive range up to the audio export limit')
  if(scene.stateMachines?.length&&!options.timelineIds)throw new Error('Specify timelineIds for a deterministic state-machine audio render')
  if(options.timelineIds&&(!options.timelineIds.length||options.timelineIds.some(id=>!scene.timelines.some(t=>t.id===id))))throw new Error('Audio timeline not found')
  const frames=Math.ceil(durationMs*sampleRate/1000),wavBytes=wavByteLength({numberOfChannels:2,length:frames,sampleRate}),pcmBytes=frames*2*4
  const renderScene=options.timelineIds?{...scene,timelines:scene.timelines.filter(t=>options.timelineIds!.includes(t.id)),stateMachines:[]}:scene
  const layers=audibleAudioLayers(scene,{timelineIds:options.timelineIds}).filter(layer=>{
    const asset=scene.assets.find(a=>a.id===layer.audio!.assetId),range=resolveAudioClipWindow(layer,asset?.durationMs,scene.composition.durationMs)
    return range.endMs>startMs&&range.startMs<startMs+durationMs
  })
  if(layers.length>64||layers.length*durationMs/5>300000)throw new Error('Audio render workload is too large; export a shorter range or fewer clips')
  const graph=scope.own(pcmBytes+(layers.length+1)*4096,()=>new OfflineAudioGraph(),value=>value.dispose())
  let pcm:{release():void}|undefined
  const schedules:AudioMixResult['clips']=[]
  try{
    graph.value.open(frames,sampleRate,scene.composition.audioMuted?0:Math.max(0,Math.min(4,scene.composition.audioVolume??1)))
    for(const layer of layers){
      scope.check(signal)
      const asset=scene.assets.find(a=>a.id===layer.audio!.assetId)
      if(!asset||asset.type!=='audio')throw new Error(`Audio source missing for '${layer.name}'`)
      let lease:AudioPcmLease|undefined=await acquireAudioBuffer(asset,{signal})
      try{
        scope.check(signal)
        const player=new ChronoPlayer(renderScene,null,{loop:false})
        const schedule=buildAudioClipSchedule(layer,lease.buffer.duration*1000,startMs,startMs+durationMs,{
          fallbackEndMs:scene.composition.durationMs,getOverridesAtTime:time=>player.tick(time).overrides,
        })
        if(!schedule)continue
        const transferred=lease;lease=undefined;graph.value.addOwnedClip(transferred,schedule)
        schedules.push({layerId:layer.id,sourceOffsetSec:schedule.sourceOffsetSec,startSec:schedule.contextStartSec,durationSec:schedule.contextDurationSec})
      }finally{lease?.release()}
    }
    scope.check(signal)
    const decoded=await scope.prepare(pcmBytes,()=>graph.value.render(),buffer=>buffer.length*buffer.numberOfChannels*4,()=>{},'audio',signal)
    pcm=decoded
    const buffer=decoded.value
    if(buffer.length!==frames||buffer.numberOfChannels!==2||buffer.sampleRate!==sampleRate)throw new Error('Offline audio backend returned unexpected PCM dimensions/rate.')
    const stats=measurePCM(buffer),warnings:string[]=[]
    if(!schedules.length)warnings.push('No audible audio clips overlap this range; output is silence.')
    if(stats.clippedSamples)warnings.push(`Mix exceeds 0 dBFS (${stats.clippedSamples} samples); lower clip or master gain. PCM WAV samples are clipped to its representable range.`)
    const encoded=scope.own(wavBytes,()=>encodeWav(buffer))
    scope.check(signal)
    return {bytes:encoded.value,mimeType:'audio/wav',startMs,durationMs,sampleRate,channels:2,frames:buffer.length,stats,warnings,clips:schedules}
  }finally{pcm?.release();graph.release()}
}

/** Legacy raw WAV handoff. Internal/native work is bounded, but retained raw
 * bytes after return belong to the caller outside managed result ownership.
 * Editor/download consumers use acquireAudioMix; MCP uses the in-scope step.
 */
export async function renderAudioMix(scene:ChronoScene,options:AudioRenderOptions={}):Promise<AudioMixResult>{
  const lease=await acquireAudioMix(scene,options)
  try{return lease.value}finally{lease.release()}
}

/** Inspect leased source PCM synchronously and release it before returning the
 * proposed gain. No authored gain/keyframe/source data is modified here. */
export async function normalizedClipGain(scene: ChronoScene, layerId: string, targetDbFS = -1) {
  return assetSourcePool.withAssets(scene.assets, async () => {
    const layer = scene.layers.find(l => l.id === layerId && l.type === 'audio')
    if (!layer?.audio) throw new Error('Audio clip not found')
    if (layer.locked) throw new Error('Unlock the audio clip before normalizing')
    if (!Number.isFinite(targetDbFS) || targetDbFS < -24 || targetDbFS > 0) throw new Error('Normalization target must be between -24 and 0 dBFS')
    if (scene.timelines.some(t => t.tracks.some(track => track.target === `layers.${layerId}.audio.volume`))) throw new Error('Remove gain automation before normalizing the static clip gain')
    const asset = scene.assets.find(a => a.id === layer.audio!.assetId && a.type === 'audio')
    if (!asset) throw new Error('Audio source not found')
    const lease = await acquireAudioBuffer(asset)
    try {
      const buffer = lease.buffer
      const range = resolveAudioClipWindow(layer, buffer.duration * 1000, scene.composition.durationMs)
      const peak = sourceRangePeak(buffer, range.sourceOffsetMs, range.durationMs, !!layer.audio.loop)
      const volume = peak > 0 ? Math.min(4, dbToGain(targetDbFS) / peak) : layer.audio.volume ?? 1
      return { volume, gainDb: gainToDb(volume), sourcePeak: peak, targetDbFS,
        reachedTarget: peak > 0 && Math.abs(peak * volume - dbToGain(targetDbFS)) < 1e-6,
        warnings: peak === 0 ? ['The source range is silent; gain is unchanged.'] : peak * volume + 1e-6 < dbToGain(targetDbFS) ? ['The +12 dB gain limit prevents reaching the requested peak.'] : [] }
    } finally { lease.release() }
  })
}
