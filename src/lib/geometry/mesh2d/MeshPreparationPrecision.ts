/** Canonical 14-significant-digit precision for prepared Mesh coordinates.
 * Authored controls remain unchanged. At ±10M local px the error is below
 * 0.0000005 px; consumers validate finite/bounded input before preparation. */
export function meshCoordinate(value: number): number { return Number(value.toPrecision(14)) }
