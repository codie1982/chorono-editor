/** Test-bundle-only counter at the existing eager preparation boundary. No
 * production instrumentation, object retention or runtime injection API. */
let count = 0
/** Count one actual materialization/index preparation, not a lazy wrapper. */
export function recordBoundsPreparation() { count++ }
/** Reset between independent synchronous React commits. */
export function resetBoundsPreparation() { count = 0 }
/** Read the scalar probe outside the measured interval. */
export function boundsPreparationCount() { return count }
