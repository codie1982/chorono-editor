import type {ChronoScene} from '../../types'
import {measureJson} from '../../format/json'
import type {OutputScope} from '../resources'
import {exportSVG,type SVGExportOptions} from './SVGExporter'
import {resolveSvgOutputLimits} from './SVGOutputLimits'

/** Budget the existing SVG builder's evaluated metadata, dense path commands,
 * fragments/flattening and result before entering it. Geometry/text preflight
 * then prevents tiny source parameters expanding into unbounded JS geometry.
 * Result holds SVG/warnings in caller scope. No renderer/schema/SMIL change.
 * Native JS object/rope internals are estimated, not a physical-RAM guarantee. */
export async function svgInScope(scene:ChronoScene,scope:OutputScope,signal?:AbortSignal,options:SVGExportOptions={}){
  scope.check(signal)
  const source=measureJson(scene,{maxBytes:96*1024**2}),limits=resolveSvgOutputLimits(options.limits),temporary=scope.child()
  try{
    temporary.own(Math.max(1,source.nodes*128+limits.maxCommands*256+limits.maxChars*4),()=>null)
    return (await scope.prepare(limits.maxChars*2+source.chars*2,async()=>exportSVG(scene,{...options,limits}),value=>
      Math.max(1,value.svg.length*2+value.warnings.reduce((sum,item)=>sum+item.length*2+64,0)),()=>{},'derived',signal)).value
  }finally{temporary.dispose()}
}
