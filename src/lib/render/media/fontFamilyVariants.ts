import type {Timeline} from '../../types'
import {parseTrackTarget} from '../../timeline/TrackTargetParser'

const snapshots=new WeakMap<readonly Timeline[],ReadonlyMap<string,readonly string[]>>()

/** All authored family keyframe values by canonical layer ID. Conservative for
 * shutter/ghost preparation: does not evaluate a second clock. Immutable timeline
 * arrays are weakly indexed once; no old scene/history is strongly retained.
 * Reuses the canonical target parser rather than inventing another path syntax. */
export function fontFamilyVariants(timelines:readonly Timeline[]):ReadonlyMap<string,readonly string[]> {
  const cached=snapshots.get(timelines);if(cached)return cached
  const result=new Map<string,string[]>()
  for(const timeline of timelines)for(const track of timeline.tracks){
    if(!track.target.endsWith('.text.fontFamily'))continue
    const target=parseTrackTarget(track.target)
    if(target?.entityType!=='layer'||target.propertyPath!=='text.fontFamily')continue
    const values=result.get(target.entityId)??[]
    for(const key of track.keyframes)if(typeof key.value==='string'&&!values.includes(key.value))values.push(key.value)
    result.set(target.entityId,values)
  }
  snapshots.set(timelines,result);return result
}
