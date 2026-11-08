import type {Asset} from '../../types'
import type {ResourceLease} from '../../resources/residency'

/** Native font byte size is opaque. alias is runtime-only and never serialized.
 * ready tracks actual native settlement; cancellation must not settle it early.
 * dispose deletes only this owner's FontFace registrations, idempotently. */
export interface FontResource { readonly alias:string;readonly ready:Promise<void>;dispose():void }
export type FontLease=ResourceLease<FontResource>
/** data is bounded owned encoded input, borrowed for native resource lifetime.
 * Default browser backend uses data when supplied, avoiding an unbounded second
 * URL fetch. URL-only custom backends own their platform's input guarantees. */
export type FontDecoder=(input:{url:string;alias:string;data?:ArrayBuffer},signal:AbortSignal)=>FontResource
export type FontState='ready'|'loading'|'error'|'notResident'
/** Borrowed font binding/readiness view. No acquire/load/registration on reads;
 * async consumers own a separate resource session, not this runtime view. */
export interface FontBindings {
  resolveFamily(css:string,assets:readonly Asset[]):string
  state(asset:Asset):FontState
}
