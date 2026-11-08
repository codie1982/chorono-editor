import {describe,expect,it} from 'vitest'
import {encodeWav} from '../wav'
import {readWavMetadata,wavPcmBytes} from './readWavMetadata'

/** Existing production WAV encoder supplies small, complete stereo samples. */
function wav(){return encodeWav({numberOfChannels:2,length:48,sampleRate:48000,getChannelData:()=>new Float32Array(48)})}

describe('PCM WAV preallocation metadata',()=>{
  it('accounts for Float32 output, channels and native resampling rather than encoded byte depth',()=>{
    const metadata=readWavMetadata(wav())!
    expect(metadata).toEqual({channels:2,frames:48,sampleRate:48000})
    expect(wavPcmBytes(metadata,48000)).toBe(49*2*4)
    expect(wavPcmBytes(metadata,96000)).toBe(97*2*4)
    expect(wavPcmBytes(metadata,44100)).toBe(46*2*4)
  })
  it('honors actual RIFF/data bounds and rejects partial frames before native decode',()=>{
    const bytes=wav(),view=new DataView(bytes.buffer)
    view.setUint32(40,193,true);expect(()=>readWavMetadata(bytes)).toThrow('bounds')
    view.setUint32(40,191,true);expect(()=>readWavMetadata(bytes)).toThrow('frame-aligned')
    view.setUint32(40,192,true);view.setUint32(4,bytes.length,true)
    expect(()=>readWavMetadata(bytes)).toThrow('RIFF size')
  })
  it('rejects PCM format/rate/alignment corruption while compressed formats stay explicitly opaque',()=>{
    const bytes=wav(),view=new DataView(bytes.buffer)
    view.setUint16(32,8,true);expect(()=>readWavMetadata(bytes)).toThrow('alignment')
    view.setUint16(20,65534,true);expect(readWavMetadata(bytes)).toBeNull()
    expect(readWavMetadata(new TextEncoder().encode('RF64 unknown'))).toBeNull()
    expect(readWavMetadata(new Uint8Array([1,2,3]))).toBeNull()
  })
  it('skips unknown padded chunks without interpreting metadata bytes as samples',()=>{
    const source=wav(),bytes=new Uint8Array(source.length+10),view=new DataView(bytes.buffer)
    bytes.set(source.subarray(0,36));bytes.set(new TextEncoder().encode('JUNK'),36)
    view.setUint32(40,1,true);bytes[44]=123;bytes.set(source.subarray(36),46)
    view.setUint32(4,bytes.length-8,true)
    expect(readWavMetadata(bytes)).toEqual(readWavMetadata(source))
  })
  it('rejects invalid public metadata and unsafe output calculations',()=>{
    expect(()=>wavPcmBytes({channels:2,sampleRate:0,frames:48},48000)).toThrow('metadata')
    expect(()=>wavPcmBytes({channels:2,sampleRate:1,frames:Number.MAX_SAFE_INTEGER},48000)).toThrow('size')
    expect(()=>wavPcmBytes({channels:2,sampleRate:48000,frames:48},NaN)).toThrow('rate')
  })
})
