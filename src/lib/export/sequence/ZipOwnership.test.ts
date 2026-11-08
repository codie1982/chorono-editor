import {describe,expect,it} from 'vitest'
import {ZipWriter} from './ZipWriter'
import {OutputResources,OutputScope} from '../resources'
import {ResourceBudget} from '../../resources/budget'
import {ZipReader} from '../../import/zip/ZipReader'

describe('ZIP output bounds and ownership',()=>{
  it('keeps a final archive independently owned after releasing all input/header staging',async()=>{
    const budget=new ResourceBudget({maxBytes:1024**2}),owner=new OutputResources({budget}),scope=new OutputScope(owner)
    const zip=new ZipWriter({scope})
    await zip.addBlob('a.txt',new Blob(['hello']))
    await zip.addBlob('b.txt',new Blob(['world']))
    const archive=zip.finishOwned()
    expect(budget.getSnapshot().chargedBytes).toBe(archive.value.size)
    const decoded=await new ZipReader().readAll(await archive.value.arrayBuffer())
    expect(new TextDecoder().decode(decoded.get('a.txt'))).toBe('hello')
    expect(new TextDecoder().decode(decoded.get('b.txt'))).toBe('world')
    archive.release();scope.dispose();owner.dispose();expect(budget.getSnapshot().chargedBytes).toBe(0)
  })
  it('preserves raw repeated finish/add while immutable input snapshots prevent CRC corruption',async()=>{
    const zip=new ZipWriter(),data=new TextEncoder().encode('first')
    zip.add('a.txt',data);data.fill(0)
    const first=zip.finish(),again=zip.finish()
    expect(new Uint8Array(await first.arrayBuffer())).toEqual(new Uint8Array(await again.arrayBuffer()))
    zip.add('b.txt',new TextEncoder().encode('second'))
    const decoded=await new ZipReader().readAll(await zip.finish().arrayBuffer())
    expect(new TextDecoder().decode(decoded.get('a.txt'))).toBe('first')
    expect(new TextDecoder().decode(decoded.get('b.txt'))).toBe('second');zip.dispose()
  })
  it('rejects archive/name/entry limits without retaining a rejected input',async()=>{
    const owner=new OutputResources(),scope=new OutputScope(owner),zip=new ZipWriter({scope,maxBytes:128,maxEntries:1})
    await expect(zip.addBlob('a.txt',new Blob([new Uint8Array(100)]))).rejects.toThrow('byte limit')
    expect(owner.getSnapshot().residency.chargedBytes).toBe(0)
    zip.add('a.txt',new Uint8Array(1))
    expect(()=>zip.add('b.txt',new Uint8Array(1))).toThrow('entry limit')
    zip.dispose();scope.dispose();expect(owner.getSnapshot().residency.chargedBytes).toBe(0);owner.dispose()
    const names=new ZipWriter();expect(()=>names.add('x'.repeat(1025),new Uint8Array(1))).toThrow('name');names.dispose()
  })
})
