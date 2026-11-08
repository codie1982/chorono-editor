import {describe,expect,it,vi} from 'vitest'
import {OutputResources} from './OutputResources'
import {outputBase64,outputBlobBase64,outputJson} from './OutputEncoding'

describe('bounded output conversion',()=>{
  it('preserves base64 bytes across chunk boundaries and retains only result pins',async()=>{
    const owner=new OutputResources({maxBytes:1024**2}),data=Uint8Array.from({length:16387},(_,i)=>i%256)
    const result=await owner.run(async(scope,signal)=>outputBase64(scope,data,data.length,signal).value)
    expect(Buffer.from(result.value,'base64')).toEqual(Buffer.from(data))
    expect(owner.getSnapshot().residency.chargedBytes).toBe(result.value.length*2+1)
    result.release();expect(owner.getSnapshot().residency.chargedBytes).toBe(0);owner.dispose()
  })
  it('denies conversion before native btoa and JSON.stringify allocation',async()=>{
    const owner=new OutputResources({maxBytes:100}),native=vi.spyOn(globalThis,'btoa'),json=vi.spyOn(JSON,'stringify')
    try{
      await expect(owner.run(async scope=>outputBase64(scope,new Uint8Array(10)).value)).rejects.toThrow('budget')
      expect(native).not.toHaveBeenCalled()
      await expect(owner.run(async scope=>outputJson(scope,{text:'x'.repeat(1000)}).value)).rejects.toThrow('budget')
      expect(json).not.toHaveBeenCalled();expect(owner.getSnapshot().residency.chargedBytes).toBe(0)
    }finally{native.mockRestore();json.mockRestore();owner.dispose()}
  })
  it('bounds Blob input before streaming and cleans both input and final output',async()=>{
    const owner=new OutputResources(),blob=new Blob(['Türkçe 🧊']),read=vi.spyOn(blob,'stream')
    const lease=await owner.run(async(scope,signal)=>(await outputBlobBase64(scope,blob,1024,signal)).value)
    expect(Buffer.from(lease.value,'base64').toString()).toBe('Türkçe 🧊');lease.release()
    const count=read.mock.calls.length
    await expect(owner.run(async(scope,signal)=>outputBlobBase64(scope,blob,1,signal))).rejects.toThrow('limit')
    expect(read).toHaveBeenCalledTimes(count);expect(owner.getSnapshot().residency.chargedBytes).toBe(0);owner.dispose()
  })
})
