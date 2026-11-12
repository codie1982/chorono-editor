import {describe,expect,it} from 'vitest'
import {emptyScene,newRectLayer,newAudioLayer} from '../../defaults'
import {assertRasterLayerSupport} from './assertRasterLayerSupport'
import {LayerRendererRegistry} from '../../registry'

describe('raster backend capability',()=>{
  it('accepts registered built-ins and explicitly nonvisual audio',()=>{
    expect(()=>assertRasterLayerSupport({...emptyScene(),layers:[newRectLayer(),newAudioLayer('audio',1000)]})).not.toThrow()
  })
  it('refuses unsupported hidden sources before output and accepts a supplied backend implementation',()=>{
    const scene={...emptyScene(),layers:[{...newRectLayer(),id:'future',name:'Future content',hidden:true}]},registry=new LayerRendererRegistry()
    expect(()=>assertRasterLayerSupport(scene,registry)).toThrow(/Future content.*bake\/convert/)
    registry.register({id:'custom',supports:layer=>layer.id==='future',render(){}})
    expect(()=>assertRasterLayerSupport(scene,registry)).not.toThrow()
  })
})
