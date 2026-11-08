import {describe,expect,it} from 'vitest'
import {ShapeToPathConverter} from './ShapeToPathConverter'
import type {ShapeKind,ShapeParams} from '../types'

describe('shape preallocation query',()=>{
  it('bounds actual converter commands with the same subdivision rules',()=>{
    const kinds:ShapeKind[]=['rect','ellipse','capsule','line','arrow','polygon','star','ring','arc','spiral','wave','blob']
    for(const kind of kinds)for(const radius of [0,12]){
      const size={width:200,height:100},params:ShapeParams={kind,sides:13,startAngle:-360,endAngle:450,turns:2.5}
      const count=ShapeToPathConverter.estimateCommandCount(kind,size,params,radius)
      const actual=ShapeToPathConverter.convert(kind,size,params,radius).commands.length
      expect(count).toBeGreaterThanOrEqual(actual);expect(count).toBeLessThan(4098)
    }
  })
  it('reports huge/nonfinite subdivision costs without building dense geometry',()=>{
    expect(ShapeToPathConverter.estimateCommandCount('polygon',{width:1,height:1},{kind:'polygon',sides:10000000})).toBe(10000001)
    expect(ShapeToPathConverter.estimateCommandCount('arc',{width:1,height:1},{kind:'arc',endAngle:Infinity})).toBe(Infinity)
  })
})
