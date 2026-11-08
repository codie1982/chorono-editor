import {expect,it} from 'vitest'
import {emptyScene,newTextLayer} from '../defaults'
import {hitTestLayer} from '../renderer'
import {measureTextLayout} from './measureText'
import {resolveLayerWorldMatrix} from '../geometry/resolveLayerWorldMatrix'

it('picks measured text beyond stale stored size and respects aligned rotated local geometry',()=>{
 const layer=newTextLayer();layer.size={width:1,height:1};layer.text={...layer.text!,value:'A long selectable line',fontSize:40,textAlign:'center'}
 layer.transform={...layer.transform,x:300,y:100,rotationDeg:20,anchorX:0,anchorY:0}
 const scene={...emptyScene(),layers:[layer]},size=measureTextLayout(layer.text),matrix=resolveLayerWorldMatrix(layer,scene)
 const inside=matrix.applyToPoint({x:-size.width/2+4,y:10}),outside=matrix.applyToPoint({x:size.width/2+4,y:10})
 expect(hitTestLayer(scene,0,inside.x,inside.y)).toBe(layer.id)
 expect(hitTestLayer(scene,0,outside.x,outside.y)).toBeNull()
})
it('uses the supplied animated text frame and leaves authored style and size unchanged',()=>{
 const layer=newTextLayer();layer.size={width:1,height:1};layer.text={...layer.text!,value:'x',fontSize:20}
 layer.transform={...layer.transform,x:0,y:0,anchorX:0,anchorY:0}
 const scene={...emptyScene(),layers:[layer]},before=JSON.stringify(scene)
 expect(hitTestLayer(scene,0,100,10,new Map())).toBeNull()
 const frame=new Map([['layers.'+layer.id+'.text.value','A long animated line']])
 expect(hitTestLayer(scene,0,100,10,frame)).toBe(layer.id)
 expect(JSON.stringify(scene)).toBe(before)
})
