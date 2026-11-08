import type {ChronoScene,Layer} from '../../types'
import type {FontBindings} from '../../asset/fonts'
import type {OverrideMap} from '../../evaluator'

/** Resolve only family override values into the same borrowed alias scope as
 * drawing. Bounds may materialize an already prepared scene again; carrying raw
 * authored family overrides would otherwise undo alias projection. Copy on the
 * first change, retain ordering/other values, and never mutate runtime input. */
export function projectFrameFontOverrides(scene:ChronoScene,overrides:OverrideMap,fonts:FontBindings|undefined):OverrideMap {
  if(!fonts||!scene.assets.some(asset=>asset.type==='font'))return overrides
  let result:OverrideMap|undefined
  overrides.forEach((value,key)=>{
    if(!key.endsWith('.text.fontFamily')||typeof value!=='string')return
    const resolved=fonts.resolveFamily(value,scene.assets)
    if(resolved!==value){result??=new Map(overrides);result.set(key,resolved)}
  })
  return result??overrides
}

/** Project ready runtime aliases into a render-only snapshot. Source JSON and
 * authored pivots remain untouched. Changed text drops its stored size so bounds
 * measure the same resolved native face as drawing. No alias is used after its
 * originating consumer pin expires. No historical snapshot/cache is retained. */
export function projectFrameFonts(scene:ChronoScene,fonts:FontBindings|undefined):ChronoScene {
  if(!fonts||!scene.assets.some(asset=>asset.type==='font'))return scene
  let layers:Layer[]|undefined
  for(let i=0;i<scene.layers.length;i++){
    const layer=scene.layers[i],css=layer.type==='text'&&layer.text?(layer.text.fontFamily??'sans-serif'):undefined
    const family=css===undefined?undefined:fonts.resolveFamily(css,scene.assets)
    const projected=family!==undefined&&family!==css?{...layer,text:{...layer.text!,fontFamily:family},size:undefined}:layer
    if(projected!==layer)layers??=scene.layers.slice(0,i)
    layers?.push(projected)
  }
  return layers?{...scene,layers}:scene
}
