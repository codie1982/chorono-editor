/** Cross-panel UI request, automatic after selection or explicit through Find.
 * A nonce permits repeating Find on the same selection; target IDs are captured
 * when the request is issued. No source/history payload. */
export interface TimelineRevealRequest {
  nonce: number
  timelineId: string
  layerIds: readonly string[]
  primaryId: string | null
}
