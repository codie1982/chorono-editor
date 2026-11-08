import {useCallback,useMemo,type Dispatch,type SetStateAction} from 'react'
import type {Layer} from '@/lib/types'
import {LayerIndex} from '@/lib/scene/LayerIndex'

/** UI adapter for selected subtree operations. Domain traversal comes solely
 * from LayerIndex; collapsed/filtered DOM rows never limit affected ids. Expand
 * changes local panel state only. Visibility delegates one bulk editor command
 * so each child's authored prior value remains recoverable by one undo.
 * Existing group/delete operations keep their explicit-selection scope.
 */
export function useSceneExplorerBranches({layers,selectedId,selectedIds,setCollapsedIds,onHidden}:{
  layers:readonly Layer[];selectedId:string|null;selectedIds:ReadonlySet<string>
  setCollapsedIds:Dispatch<SetStateAction<Set<string>>>
  onHidden?: (ids:string[],field:'hidden',value:boolean)=>void
}){
  const index=useMemo(()=>new LayerIndex(layers),[layers])
  const roots=useMemo(()=>Array.from(selectedIds.size?selectedIds:selectedId?[selectedId]:[]).filter(id=>!!index.get(id)),[selectedId,selectedIds,index])
  const ids=useMemo(()=>index.subtreeIds(roots),[index,roots])
  const summary=useMemo(()=>{
    let hiddenCount=0,hasChildren=false
    ids.forEach(id=>{if(index.get(id)?.hidden)hiddenCount++;if(index.childrenOf(id).length)hasChildren=true})
    return {hiddenCount,hasChildren}
  },[index,ids])
  /** Resolve current ids once per click; overlapping roots are deduplicated. */
  const setExpanded=useCallback((targets:readonly string[],expanded:boolean)=>{
    const scope=index.subtreeIds(targets)
    setCollapsedIds(previous=>{
      const next=new Set(previous)
      scope.forEach(id=>expanded?next.delete(id):next.add(id))
      return next.size===previous.size?previous:next
    })
  },[index,setCollapsedIds])
  /** Do not author redundant false flags or create no-op history entries. */
  const setHidden=useCallback((targets:readonly string[],hidden:boolean)=>{
    const changed=Array.from(index.subtreeIds(targets)).filter(id=>!!index.get(id)?.hidden!==hidden)
    if(changed.length)onHidden?.(changed,'hidden',hidden)
  },[index,onHidden])
  return {roots,ids,...summary,setExpanded,setHidden}
}
