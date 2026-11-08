import {afterEach,describe,expect,it,vi} from 'vitest'
import {FontHandler} from '../handlers/asset/FontHandler'
import {fontAssetService,FontRegistrationUnavailable} from '../../asset/fonts'
import {releaseImportSources} from '../resources/importSources'

afterEach(()=>vi.restoreAllMocks())
describe('font import failure and cancellation contract',()=>{
  it('preserves a warning only for expected native font compatibility failure',async()=>{
    vi.spyOn(fontAssetService,'acquire').mockRejectedValue(new FontRegistrationUnavailable('not supported'))
    const result=await new FontHandler().handle(new File(['test'],'Brand.woff',{type:'font/woff'}))
    expect(result.assets).toHaveLength(1);expect(result.warnings).toHaveLength(1)
    releaseImportSources(result)
  })
  it.each(['RangeError','AbortError','TimeoutError','Error'])('keeps %s fatal instead of importing a success with warnings',async name=>{
    const failure=new Error('font input refused');failure.name=name
    vi.spyOn(fontAssetService,'acquire').mockRejectedValue(failure)
    await expect(new FontHandler().handle(new File(['test'],'Brand.woff'))).rejects.toBe(failure)
  })
  it('forwards document cancellation and rejects cancellation at the progress handoff',async()=>{
    const abort=new AbortController(),release=vi.fn(),acquire=vi.spyOn(fontAssetService,'acquire').mockResolvedValue({
      value:{alias:'owned',ready:Promise.resolve(),dispose(){}},retain(){return this},release,
    })
    const pending=new FontHandler().handle(new File(['test'],'Brand.woff'),undefined,progress=>{
      if(progress.stage==='complete')abort.abort()
    },{signal:abort.signal})
    await expect(pending).rejects.toMatchObject({name:'AbortError'})
    expect(acquire).toHaveBeenCalledWith(expect.anything(),{signal:abort.signal});expect(release).toHaveBeenCalledOnce()
  })
})
