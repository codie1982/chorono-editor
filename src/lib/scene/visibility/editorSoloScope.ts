import type {Layer} from '@/lib/types'
import {LayerIndex} from '../LayerIndex'

/** Resolve editable ids under independent visual/audio solo domains.
 * A solo visual parent includes its authored subtree, even when the parent is
 * absent from a timeline's membership list. This is a UI scope, not a render,
 * time or hidden predicate: inactive/hidden keys remain editable. Tree adapters
 * request ancestor context; flat timelines keep separate membership filtering.
 * Null means unrestricted. LayerIndex supplies the bounded subtree walk;
 * ancestor closure visits each parent once and tolerates missing ids/cycles.
 * Expected O(n), without mutation, recursion, DOM or geometry/resource ownership.
 */
export function editorSoloScope(layers:readonly Layer[],includeAncestors=false):ReadonlySet<string>|null{
  const visualRoots=layers.filter(layer=>layer.type!=='audio'&&layer.solo).map(layer=>layer.id)
  const audioSolo=layers.some(layer=>layer.type==='audio'&&layer.solo)
  if(!visualRoots.length&&!audioSolo)return null
  const index=new LayerIndex(layers),visualIds=visualRoots.length?index.subtreeIds(visualRoots):null
  const scope=new Set(layers.filter(layer=>layer.type==='audio'?(!audioSolo||layer.solo):(!visualIds||visualIds.has(layer.id))).map(layer=>layer.id))
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
