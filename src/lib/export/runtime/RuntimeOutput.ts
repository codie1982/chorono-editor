import type {ChronoScene} from '../../types'
import {measureJson} from '../../format/json'
import {defaultRuntimeExporter} from '../RuntimeExporter'
import type {OutputScope} from '../resources'

/** Admit metadata/sort-array working-set policy before the existing runtime
 * optimizer. Source strings/geometry remain borrowed; its algorithms create
 * shallow layer/track records, keyframe ordering arrays and warnings. A 256-byte
 * per serialized source-node estimate covers this explicit output policy; it
 * does not measure JS-engine object sizes or GC peaks. No export schema, asset
 * inclusion, ordering or optimizer behavior is changed by this wrapper. */
export function runtimePackageInScope(scene:ChronoScene,scope:OutputScope){
  const source=measureJson(scene,{maxBytes:96*1024**2})
  return scope.own(Math.max(1,source.nodes*256),()=>defaultRuntimeExporter.export(scene)).value
}
