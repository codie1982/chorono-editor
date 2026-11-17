/** Authoritative transport projection of the script SplineHandle. Shared by
 * QuickJS proxy generation, host admission and parity tests. Private helpers,
 * UI-only state and asynchronous CPU solvers are deliberately absent. */
export const SPLINE_SCRIPT_SURFACE = Object.freeze({
  properties: ['data', 'bounds'],
  valueMethods: ['getPoint', 'getHandle', 'getSegment', 'getContour', 'getSubShape', 'appendPrimitive', 'addContour', 'addPoint', 'setHandle', 'splitSegment', 'edit'],
  chainMethods: ['movePoint', 'removePoint', 'setPointType', 'setPointLocked', 'removeHandle', 'setHandleLocked', 'setSegmentType', 'setQuadraticControl', 'setContourClosed', 'reverseContour', 'removeContour', 'removeSubShape', 'setSubShape', 'setFillRule', 'transform'],
} as const)
