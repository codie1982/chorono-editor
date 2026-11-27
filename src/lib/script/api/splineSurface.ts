/** Authoritative transport projection of the script SplineHandle. Shared by
 * QuickJS proxy generation, host admission and parity tests. Private helpers,
 * UI-only state and asynchronous native worker plans are deliberately absent.
 * The bounded legacy modeling helpers remain available through the same
 * guarded host commands as direct SplineHandle callers. */
export const SPLINE_SCRIPT_SURFACE = Object.freeze({
  properties: ['data', 'bounds'],
  valueMethods: ['getPoint', 'getHandle', 'getSegment', 'getContour', 'getSubShape', 'appendPrimitive', 'addContour', 'addPoint', 'setHandle', 'splitSegment', 'edit', 'offsetContour', 'outlineContour'],
  chainMethods: ['movePoint', 'removePoint', 'setPointType', 'setPointLocked', 'removeHandle', 'setHandleLocked', 'setSegmentType', 'setQuadraticControl', 'setContourClosed', 'reverseContour', 'removeContour', 'removeSubShape', 'setSubShape', 'setFillRule', 'transform', 'chamferCorners', 'filletCorners'],
} as const)
