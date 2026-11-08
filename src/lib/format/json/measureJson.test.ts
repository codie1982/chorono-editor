import {describe,expect,it,vi} from 'vitest'
import {measureJson,utf8ByteLength} from './measureJson'

describe('allocation-free JSON preflight',()=>{
  it('counts HTML escapes exactly and rejects function/array custom serializers before native allocation',()=>{
    expect(measureJson({'<':['>','<<']}).scriptEscapes).toBe(4)
    const custom=vi.fn(),fn=Object.assign(()=>{}, {toJSON:custom})
    expect(()=>measureJson({fn})).toThrow('Custom JSON');expect(custom).not.toHaveBeenCalled()
    const array=[1,2];Object.setPrototypeOf(array,{toJSON:custom})
    expect(()=>measureJson(array)).toThrow('plain');expect(custom).not.toHaveBeenCalled()
  })
  it('matches native JSON and TextEncoder lengths for escaping, unicode, indentation and omission',()=>{
    const shared={word:'Türkçe 🧊 \ud800 \udc00\n\t\u0001 " \\',empty:''}
    const values=[null,true,-0,NaN,Infinity,123e100,shared,{left:shared,right:shared,absent:undefined,fn:()=>{}},[undefined,,Symbol('x'),false],{a:[{},[],[1,'二']]}]
    for(const value of values)for(const space of [0,2] as const){
      const expected=JSON.stringify(value,null,space)
      const result=measureJson(value,{space})
      expect(result.chars).toBe(expected.length);expect(result.utf8Bytes).toBe(new TextEncoder().encode(expected).length)
      expect(utf8ByteLength(expected)).toBe(new TextEncoder().encode(expected).length)
    }
    for(const text of ['','x','\ud800','\udc00','é🧊二\n'])expect(utf8ByteLength(text)).toBe(new TextEncoder().encode(text).length)
  })
  it('rejects cycles, native objects, accessors, custom conversion and excessive structures without invoking them',()=>{
    const getter=vi.fn(),custom=vi.fn(),cyclic:{self?:unknown}={};cyclic.self=cyclic
    for(const input of [cyclic,new Date(),{get value(){getter();return 1}},{toJSON:custom}])expect(()=>measureJson(input)).toThrow()
    expect(getter).not.toHaveBeenCalled();expect(custom).not.toHaveBeenCalled()
    expect(()=>measureJson({long:'a'.repeat(1000)},{maxChars:20})).toThrow('size')
    expect(()=>measureJson('二'.repeat(20),{maxBytes:30})).toThrow('size')
    expect(()=>measureJson(new Array(1000000),{maxNodes:10})).toThrow('structure')
    expect(()=>measureJson([[[1]]],{maxDepth:2})).toThrow('structure')
    expect(()=>utf8ByteLength('🧊',3)).toThrow('limit')
    expect(()=>measureJson({n:BigInt(1)})).toThrow('Unsupported')
  })
})
