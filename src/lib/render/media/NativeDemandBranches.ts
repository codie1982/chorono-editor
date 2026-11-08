import type {Layer} from '../../types'
import type {LayerRendererRegistry} from '../../registry/LayerRendererRegistry'
import type {PreparedRenderFrame} from './types'

/** Sparse native-demand traversal hints, not visibility or a second scene graph.
 * Only a plugin's explicit nativeMediaFree certificate excludes a direct leaf.
 * Mask hosts, instances and unclassified/dynamic plugins always remain candidates.
 * Current-frame parent chains retain their ancestors so actual traversal still
 * applies existing hidden/time/solo and reference rules. No native object, scene
 * history or frame output is retained; source IDs rebuild after immutable edits
 * or registry replacement. An empty current dependency query is NOT a certificate.
 */
export class NativeDemandBranches {
  private layers?:readonly Layer[]
  private revision=-1
  private candidates:readonly string[]=[]
  /** Borrow registry metadata/revision; no plugin or native resource is created. */
  constructor(private readonly registry:Pick<LayerRendererRegistry,'find'|'getRevision'>){}

  /** Select current frame branches in O(candidates × hierarchy depth), after
   * one O(source layers) metadata scan per edit/registry generation. Malformed
   * parent cycles are bounded. Returned Set is frame-local and caller-owned. */
  select(frame:PreparedRenderFrame):ReadonlySet<string>{
    const layers=frame.sourceScene.layers,revision=this.registry.getRevision()
    if(layers!==this.layers||revision!==this.revision){
      this.layers=layers;this.revision=revision
      this.candidates=layers.filter(layer=>!!layer.instanceOf||!!layer.masks?.length||!this.registry.find(layer)?.nativeMediaFree).map(layer=>layer.id)
    }
    const branches=new Set<string>()
    for(const id of this.candidates){
      let layer=frame.index.get(id)
      while(layer&&!branches.has(layer.id)){
        branches.add(layer.id);layer=layer.parentId?frame.index.get(layer.parentId):undefined
      }
    }
    return branches
  }
}
