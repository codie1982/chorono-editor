import type {ChronoScene} from '../../types'
import {ShapeToPathConverter} from '../../geometry'
import {measureJson} from '../../format/json'
import {LayerIndex} from '../../scene/LayerIndex'

export interface SVGOutputLimits{maxChars:number;maxCommands:number}
export const SVG_OUTPUT_LIMITS:Readonly<SVGOutputLimits>=Object.freeze({maxChars:32*1024**2,maxCommands:100000})

/** Validate immutable output policy before allocation. Source depth/layer caps
 * keep traversal metadata finite; command counts are upper bounds, not a LOD.
 * Native/string memory remains a policy estimate, never a total process cap. */
export function resolveSvgOutputLimits(limits:Partial<SVGOutputLimits>={}):SVGOutputLimits{
  const result={...SVG_OUTPUT_LIMITS,...limits}
  if(!Number.isSafeInteger(result.maxChars)||result.maxChars<1||result.maxChars>SVG_OUTPUT_LIMITS.maxChars
    ||!Number.isSafeInteger(result.maxCommands)||result.maxCommands<1||result.maxCommands>SVG_OUTPUT_LIMITS.maxCommands)throw new RangeError('Invalid SVG output limits.')
  return result
}

/** Preflight the already evaluated scene before path/SMIL/escaped text builders.
 * Reuses authoritative geometry subdivision queries. Character upper bounds
 * cover command numbers, XML/uppercase expansion, gradient records and SMIL
 * samples; overly complex output rejects without truncation. Hidden/unreachable
 * source layers are conservatively counted too. Original stacking/visibility
 * and output bytes are unaffected for admitted documents. */
export function preflightSvgOutput(scene:ChronoScene,animated:boolean,limits:SVGOutputLimits):void{
  if(scene.layers.length>5000)throw new RangeError('SVG layer limit exceeded.')
  const index=new LayerIndex(scene.layers),ids=new Set<string>()
  let commands=0,chars=8192
  for(const layer of scene.layers){
    if(ids.has(layer.id))throw new Error('Duplicate SVG layer id.');ids.add(layer.id)
    const parents=new Set([layer.id]);let parent=layer.parentId
    while(parent){
      if(parents.has(parent)||parents.size>64)throw new RangeError('Cyclic or excessively deep SVG groups.')
      parents.add(parent);parent=index.get(parent)?.parentId
    }
    const source=measureJson({name:layer.name,style:layer.style,text:layer.text},{maxChars:limits.maxChars,maxBytes:limits.maxChars*3})
    chars+=2048+source.chars*(layer.text?.uppercase?18:6)+source.nodes*128
    if(layer.type==='shape')commands+=ShapeToPathConverter.estimateCommandCount(layer.shapeKind??layer.shape??'rect',layer.size??{width:0,height:0},layer.shapeParams,layer.style?.cornerRadius??0)
    if(layer.type==='path')commands+=(layer.path?.anchors.length??0)+2
    if(!Number.isSafeInteger(commands)||commands>limits.maxCommands)throw new RangeError('SVG geometry command limit exceeded before conversion.')
    if(chars+commands*256>limits.maxChars)throw new RangeError('SVG text preparation limit exceeded.')
  }
  if(animated)for(const timeline of scene.timelines)for(const track of timeline.tracks){
    chars+=(track.keyframes.length+2)*256
    if(chars+commands*256>limits.maxChars)throw new RangeError('SVG animation text preparation limit exceeded.')
  }
}
