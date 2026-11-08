import {memo} from 'react'

/** Compact explicit subtree actions, including single selected parents. Counts
 * include hidden/collapsed/filter-excluded descendants. This stateless view
 * owns no scene, history, timers or traversal; the panel's adapter supplies them.
 */
function SubtreeOperationsToolbar({selectedCount,affectedCount,hasChildren,hiddenCount,canSetHidden,onExpand,onCollapse,onShow,onHide}:{
  selectedCount:number;affectedCount:number;hasChildren:boolean;hiddenCount:number;canSetHidden:boolean
  onExpand:()=>void;onCollapse:()=>void;onShow:()=>void;onHide:()=>void
}){
  const button='rounded px-2 py-1 text-[10px] text-gray-200 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400'
  return <div role="group" aria-label="Selected subtree operations"
    className="flex flex-wrap items-center gap-1 border-b border-gray-700 bg-gray-900 px-2 py-1 shrink-0">
    <span className="text-[10px] text-gray-400 mr-1" title="Operations include selected layers and all their descendants, including hidden or collapsed children.">{selectedCount} selected · {affectedCount} with children</span>
    <button className={button} disabled={!hasChildren} title="Expand selected layers and all descendant groups" onClick={onExpand}>Expand subtree</button>
    <button className={button} disabled={!hasChildren} title="Collapse selected layers and all descendant groups" onClick={onCollapse}>Collapse subtree</button>
    <button className={button} disabled={!canSetHidden||hiddenCount===0} title="Show every layer in the selected subtrees; one undo restores prior flags" onClick={onShow}>Show subtree</button>
    <button className={button} disabled={!canSetHidden||hiddenCount===affectedCount} title="Hide every layer in the selected subtrees; one undo restores prior flags" onClick={onHide}>Hide subtree</button>
  </div>
}
export default memo(SubtreeOperationsToolbar)
