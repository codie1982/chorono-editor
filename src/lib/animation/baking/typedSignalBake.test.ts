import { describe, expect, it } from 'vitest'
import { prepareTypedSignalBake } from './typedSignalBake'
import { createTrackSampler } from '../../evaluator'

const options = { startMs: 0, endMs: 1000, fps: 60, tolerance: .1 }

describe('bounded typed native bake', () => {
  it.each(['boolean','string'] as const)('compresses %s changes into hold keys including exact end', kind => {
    const sample = (ms: number) => kind === 'boolean' ? ms >= 500 : ms >= 500 ? 'after' : 'before'
    const prepared = prepareTypedSignalBake('layers.label.text.value', kind, options, sample)
    expect(prepared.track.keyframes).toHaveLength(3)
    expect(prepared.track.keyframes.every(key => key.easing.type === 'hold')).toBe(true)
    const native = createTrackSampler(prepared.track)
    for (const ms of [0,200,499,500,800,1000]) expect(native(ms)).toEqual(sample(ms))
    expect(prepared.report.maxSampleError).toBe(0)
  })
  it.each(['color','vec2'] as const)('keeps %s channel errors bounded with ordinary typed playback', kind => {
    const sample = (ms: number) => kind === 'color' ? {r:100+50*Math.sin(ms/200),g:ms/10,b:20,a:255} : {x:ms/10,y:30*Math.sin(ms/200)}
    const prepared = prepareTypedSignalBake('layers.layer.value',kind,options,sample), native=createTrackSampler(prepared.track)
    expect(prepared.report.maxSampleError).toBeLessThanOrEqual(prepared.report.valueSpan * options.tolerance + 1e-8)
    expect(prepared.track.keyframes.length).toBeLessThan(prepared.report.sampleCount)
    expect(native(0)).toEqual(sample(0)); expect(native(1000)).toEqual(sample(1000))
    expect(new Set(prepared.track.keyframes.map(key=>key.id)).size).toBe(prepared.track.keyframes.length)
  })
  it('reports discrete between-sample mismatch instead of claiming continuous equality', () => {
    const prepared = prepareTypedSignalBake('value','boolean',{...options,fps:2},ms=>ms>=200)
    expect(prepared.report.maxSampleError).toBe(0); expect(prepared.report.maxMidpointError).toBe(1)
  })
  it('rejects changed output types, cancellation and excessive samples before publication', () => {
    expect(()=>prepareTypedSignalBake('value','string',options,ms=>ms<500?'text':false)).toThrow(/changed type/)
    const abort=new AbortController();abort.abort()
    expect(()=>prepareTypedSignalBake('value','vec2',{...options,signal:abort.signal},()=>({x:1,y:2}))).toThrow(/cancel/)
    expect(()=>prepareTypedSignalBake('value','boolean',{...options,endMs:1e8},()=>true)).toThrow(/sample/)
  })
})
