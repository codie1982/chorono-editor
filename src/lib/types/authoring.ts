/** Editor source attribution, never an authentication or content-ownership claim.
 * Missing legacy records mean unknown. Actor names are optional display labels;
 * no machine/user identifier, credential or wall-clock history is persisted. */
export interface AuthoringActor { readonly kind: 'human' | 'agent' | 'import' | 'unknown'; readonly name?: string }
export interface AuthoringStamp {
  readonly actor: AuthoringActor
  readonly transactionId?: string
  readonly requestId?: string
}

/** Stable identity tuples. JSON encoding avoids dot/slash ambiguity in IDs.
 * Field paths use separate string tuples, never array indices as identities. */
export type AuthoringAddress =
  | readonly ['scene']
  | readonly ['layer', string]
  | readonly ['timeline', string]
  | readonly ['track', string, string]
  | readonly ['key', string, string, string]
  | readonly ['spline', string, 'points' | 'handles' | 'segments' | 'contours' | 'subShapes', string]
  | readonly ['entity', string, string]

/** Creation and latest edit are distinct. baseWriter covers original content;
 * fields records only subsequent writes, including removed properties. Copies
 * retain inherited content attribution separately from their new creation. */
export interface AuthoringRecord {
  readonly address: AuthoringAddress
  readonly createdBy: AuthoringStamp
  readonly lastWriter: AuthoringStamp
  readonly baseWriter: AuthoringStamp
  readonly fields: Readonly<Record<string, AuthoringStamp>>
  readonly inheritedFrom?: AuthoringAddress
}
export interface SceneAuthoring {
  readonly version: 1
  readonly records: Readonly<Record<string, AuthoringRecord>>
  /** Capacity/ambiguous legacy identities omitted information; missing = unknown. */
  readonly truncated?: true
}

/** Internal command hints, not public setters or scene fields. The editor stamps
 * once on commit. A restore preserves a validated saved ledger verbatim. Copy
 * maps are explicit native ID maps, never guesses based on names/array positions. */
export interface AuthoringHints {
  readonly mode?: 'edit' | 'restore' | 'import'
  readonly stamp?: AuthoringStamp
  readonly copies?: readonly { readonly from: AuthoringAddress; readonly to: AuthoringAddress }[]
  /** Copy identity coverage was bounded; untracked new content stays unknown. */
  readonly incomplete?: true
}
