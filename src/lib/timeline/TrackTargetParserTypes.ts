// ── ParsedTrackTarget (BL-59) ─────────────────────────────────────────────────
//
// Type-only module — separated from TrackTargetParser so consumers can import
// the type without pulling in the parsing functions (helps tree-shaking).

export interface ParsedTrackTarget {
  /** Which kind of entity does this target reference. */
  entityType: 'layer' | 'modifier' | 'effect' | 'marker'
  /** The entity's id (e.g. "card", "rect_3", "marker_1"). */
  entityId: string
  /**
   * The property path AFTER `{entityType}s.{entityId}.`.
   * Empty string for top-level entity targets (e.g. markers.X).
   * Otherwise dotted, e.g. "transform.x", "style.fill",
   * "pathStroke.trim.offset".
   */
  propertyPath: string
}
