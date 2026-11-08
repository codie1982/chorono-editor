import type {Asset} from '../../types'
import {describeFont,fontCatalog} from './FontCatalog'
import type {FontBindings,FontState} from './types'

export interface FontBindingRecord { readonly asset:Asset;readonly alias?:string;state():FontState }

/** Borrowed source-scoped font view. Records contain no pin/native handle.
 * Late consumers cannot use a ready alias after its exact originating pin was
 * released. CSS resolution uses the supplied immutable asset scope, never a
 * global current document. Metadata alias IDs share one native source record. */
export class FontBindingsSnapshot implements FontBindings {
  private readonly records=new Map<string,FontBindingRecord>()
  /** Borrow liveness callbacks and aliases, not native handles or pin ownership. */
  constructor(records:readonly FontBindingRecord[]) {
    records.forEach(record=>{try{this.records.set(describeFont(record.asset).key,record)}catch{/* Invalid assets report errors from the session. */}})
  }
  /** No loading or LRU refresh. Pending/expired imported sources use the authored
   * fallback list (or sans-serif), not another document's same-name FontFace. */
  resolveFamily(css:string,assets:readonly Asset[]):string {
    return fontCatalog(assets).resolve(css,descriptor=>{
      const record=this.records.get(descriptor.key)
      return record?.state()==='ready'?record.alias:undefined
    })
  }
  /** Current viewport ownership status, not shared warm-cache residency. */
  state(asset:Asset):FontState {
    try{return this.records.get(describeFont(asset).key)?.state()??'notResident'}catch{return 'error'}
  }
}
