/** Explicit cross-panel UI request. A nonce permits repeating Find on the same
 * selection; target IDs are captured at click time. No source/history payload. */
export interface TimelineRevealRequest {
  nonce: number
  timelineId: string
  layerIds: readonly string[]
  primaryId: string | null
}
