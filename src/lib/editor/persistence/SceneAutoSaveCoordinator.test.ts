import {afterEach,describe,expect,it,vi} from 'vitest'
import {SceneAutoSaveCoordinator} from './SceneAutoSaveCoordinator'
import {SceneSaveConflictError} from './SceneSaveConflictError'
import {emptyScene} from '../../defaults'
import type {ChronoScene} from '../../types'

function gate<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes});return {promise,resolve}}
/** Tests observable ownership at the port, not the implementation's counters. */
function sources(){
  let held=0,peak=0
  return {get held(){return held},get peak(){return peak},retain:(_scene:ChronoScene)=>{
    held++;peak=Math.max(peak,held);let released=false
    return {release(){expect(released).toBe(false);released=true;held--}}
  }}
}
afterEach(()=>vi.useRealTimers())

describe('bounded scene autosave orchestration',()=>{
  it('coalesces a burst to one latest pending scene and serializes CAS versions',async()=>{
    vi.useFakeTimers();const pins=sources(),first=gate<number>(),a=emptyScene(),saved=vi.fn(),calls:ChronoScene[]=[]
    const save=vi.fn(async(scene:ChronoScene,version:number)=>{calls.push(scene);return calls.length===1?first.promise:version+1})
    const owner=new SceneAutoSaveCoordinator({retain:pins.retain,save,onStatus:saved})
    owner.request(a,true);await vi.advanceTimersByTimeAsync(0)
    let latest=emptyScene()
    for(let i=0;i<200;i++){latest=emptyScene();owner.request(latest)}
    expect(pins.held).toBe(2);expect(pins.peak).toBeLessThanOrEqual(3);expect(save).toHaveBeenCalledTimes(1)
    first.resolve(1);await vi.advanceTimersByTimeAsync(1000)
    expect(calls).toEqual([a,latest]);expect(save.mock.calls[1][1]).toBe(1);expect(pins.held).toBe(0)
    owner.dispose();expect(vi.getTimerCount()).toBe(0)
  })
  it('handles undo to the active or previously saved scene without a stale pending write',async()=>{
    vi.useFakeTimers();const pins=sources(),a=emptyScene(),b=emptyScene(),one=gate<number>(),two=gate<number>()
    const save=vi.fn().mockReturnValueOnce(one.promise).mockReturnValueOnce(two.promise).mockResolvedValue(3)
    const owner=new SceneAutoSaveCoordinator({retain:pins.retain,save,onStatus:vi.fn()})
    owner.request(a,true);await vi.advanceTimersByTimeAsync(0);owner.request(b);owner.request(a)
    expect(pins.held).toBe(1);one.resolve(1);await vi.advanceTimersByTimeAsync(1000);expect(save).toHaveBeenCalledTimes(1)
    owner.request(b,true);await vi.advanceTimersByTimeAsync(0);owner.request(a,true)
    two.resolve(2);await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledTimes(3);expect(save.mock.calls[2][0]).toBe(a);expect(save.mock.calls[2][1]).toBe(2)
    expect(pins.held).toBe(0);owner.dispose()
  })
  it('limits retries/sources and never retries conflicts or quota failures',async()=>{
    vi.useFakeTimers()
    for(const failure of [new Error('network'),new SceneSaveConflictError(),new RangeError('quota')]){
      const pins=sources(),save=vi.fn(async()=>{throw failure}),owner=new SceneAutoSaveCoordinator({retain:pins.retain,save,onStatus:vi.fn()})
      owner.request(emptyScene(),true);await vi.advanceTimersByTimeAsync(60000)
      expect(save).toHaveBeenCalledTimes(failure.constructor===Error?4:1);expect(pins.held).toBe(0);expect(vi.getTimerCount()).toBe(0);owner.dispose()
    }
  })
  it('does not let continuous edits postpone saving beyond the fallback deadline',async()=>{
    vi.useFakeTimers();const pins=sources(),save=vi.fn(async(_scene:ChronoScene)=>1),owner=new SceneAutoSaveCoordinator({retain:pins.retain,save,onStatus:vi.fn(),intervalMs:1000,fallbackMs:2500})
    owner.request(emptyScene());let latest=emptyScene()
    for(let i=0;i<3;i++){await vi.advanceTimersByTimeAsync(800);latest=emptyScene();owner.request(latest)}
    expect(save).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(100)
    expect(save).toHaveBeenCalledOnce();expect(save.mock.calls[0][0]).toBe(latest);expect(pins.held).toBe(0);owner.dispose()
  })
  it('disposal holds active source until settlement and prevents late publication',async()=>{
    vi.useFakeTimers();const pins=sources(),native=gate<number>(),status=vi.fn(),save=vi.fn((_scene:ChronoScene,_version:number,signal:AbortSignal)=>{expect(signal.aborted).toBe(false);return native.promise})
    const owner=new SceneAutoSaveCoordinator({retain:pins.retain,save,onStatus:status})
    owner.request(emptyScene(),true);await vi.advanceTimersByTimeAsync(0);owner.request(emptyScene());owner.dispose()
    expect(pins.held).toBe(1);expect(save.mock.calls[0][2].aborted).toBe(true)
    const count=status.mock.calls.length;native.resolve(1);await vi.advanceTimersByTimeAsync(60000)
    expect(status).toHaveBeenCalledTimes(count);expect(pins.held).toBe(0);expect(vi.getTimerCount()).toBe(0)
  })
  it('keeps observers and offline state from leaking sources',async()=>{
    vi.useFakeTimers();const pins=sources(),save=vi.fn(async()=>1),owner=new SceneAutoSaveCoordinator({retain:pins.retain,save,online:()=>false,onStatus(){throw new Error('observer failed')}})
    owner.request(emptyScene(),true);await vi.advanceTimersByTimeAsync(0);expect(save).not.toHaveBeenCalled();expect(pins.held).toBe(0);owner.dispose()
  })
})
