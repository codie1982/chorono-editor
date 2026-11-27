import type {Layer} from '@/lib/types'
import {LayerIndex} from '../LayerIndex'

/** Resolve editable ids under independent visual/audio solo domains.
 * A solo visual parent includes its authored subtree, even when the parent is
 * absent from a timeline's membership list. This is a UI scope, not a render,
 * time or hidden predicate: inactive/hidden keys remain editable. Tree adapters
 * request ancestor context; flat timelines keep separate membership filtering.
 * Null means unrestricted. LayerIndex supplies the bounded subtree walk;
 * ancestor closure visits each parent once and tolerates missing ids/cycles.
 * Optional index must describe these same layers and is borrowed for this call.
 * Expected O(n), without mutation, recursion, DOM or geometry/resource ownership.
 */
export function editorSoloScope(layers:readonly Layer[],includeAncestors=false,suppliedIndex?:LayerIndex):ReadonlySet<string>|null{
  const visualRoots:string[]=[]
  let audioSolo=false
  for(const layer of layers)if(layer.solo){
    if(layer.type==='audio')audioSolo=true
    else visualRoots.push(layer.id)
  }
  if(!visualRoots.length&&!audioSolo)return null
  const index=suppliedIndex??new LayerIndex(layers),visualIds=visualRoots.length?index.subtreeIds(visualRoots):null
  const scope=new Set<string>()
  for(const layer of layers)if(layer.type==='audio'?(!audioSolo||layer.solo):(!visualIds||visualIds.has(layer.id)))scope.add(layer.id)
  if(includeAncestors){
    const walked=new Set<string>()
    for(const id of Array.from(scope)){
      let parentId=index.get(id)?.parentId
      while(parentId&&!walked.has(parentId)){
        walked.add(parentId)
        const parent=index.get(parentId)
        if(!parent)break
        scope.add(parent.id);parentId=parent.parentId
      }
    }
  }
  return scope
}
