/** Aggregate source and live projection admission. The LRU budget alone cannot
 * bound a live scene's generated splines: its evaluated snapshot owns every
 * result until the renderer releases that frame. Counts reject, never truncate. */
export const BOOLEAN_SCENE_LIMITS = Object.freeze({ operations: 64, outputVertices: 65536 })
