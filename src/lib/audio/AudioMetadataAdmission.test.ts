import {describe,expect,it,vi} from 'vitest'
import {AudioAssetService} from './AudioAssetService'
import {ResourceBudget} from '../resources/budget'
import {encodeWav} from './wav'

const wav=()=>encodeWav({numberOfChannels:2,length:48,sampleRate:48000,getChannelData:()=>new Float32Array(48)})
describe('PCM output admission before native decoding',()=>{
  it('refuses known oversized Float32/resampled output before invoking a decoder, including legacy borrows',async()=>{
    const budget=new ResourceBudget({maxBytes:4096}),decodeAudioData=vi.fn()
    const service=new AudioAssetService({budget,maxBytes:600,decodeReserveBytes:64,fetch:async()=>new Response(wav()),
      createContext:()=>({state:'running',sampleRate:96000,decodeAudioData,close:async()=>{}} as unknown as AudioContext)})
    await expect(service.acquireUrl('stereo')).rejects.toThrow('before decode')
    await expect(service.loadUrl('legacy-stereo')).rejects.toThrow('before decode')
    expect(decodeAudioData).not.toHaveBeenCalled();expect(budget.getSnapshot().chargedBytes).toBe(0);await service.dispose()
  })
  it('reserves Float32 output alongside encoded input before decode and reconciles actual retained bytes',async()=>{
    const budget=new ResourceBudget({maxBytes:4096}),encoded=wav()
    const service=new AudioAssetService({budget,decodeReserveBytes:64,fetch:async()=>new Response(encoded),createContext:()=>({
      state:'running',sampleRate:48000,close:async()=>{},decodeAudioData:async()=>{
        expect(budget.getSnapshot().chargedBytes).toBe(encoded.byteLength+49*2*4)
        return {length:48,numberOfChannels:2,sampleRate:48000} as AudioBuffer
      },
    } as unknown as AudioContext)})
    const pin=await service.acquireUrl('stereo')
    expect(budget.getSnapshot().categories.input.residentBytes).toBe(0)
    expect(budget.getSnapshot().chargedBytes).toBe(48*2*4)
    pin.release();await service.dispose();expect(budget.getSnapshot().chargedBytes).toBe(0)
  })
  it('rejects malformed recognized PCM before even constructing an AudioContext',async()=>{
    const bytes=wav();new DataView(bytes.buffer).setUint32(40,99999,true)
    const createContext=vi.fn(),budget=new ResourceBudget({maxBytes:4096})
    const service=new AudioAssetService({budget,decodeReserveBytes:64,fetch:async()=>new Response(bytes),createContext})
    await expect(service.acquireUrl('bad')).rejects.toThrow('bounds')
    expect(createContext).not.toHaveBeenCalled();expect(budget.getSnapshot().chargedBytes).toBe(0);await service.dispose()
  })
})
