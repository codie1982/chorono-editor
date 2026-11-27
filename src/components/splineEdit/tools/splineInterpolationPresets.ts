/** Shared local-pixel choices for direct context-menu Apply. Null removes the
 * Object policy and restores each consumer's existing default precision. */
export const splineInterpolationPresets: readonly { label: string; value: number | null }[] = [
  { label: 'Default (automatic)', value: null },
  ...[.05, .1, .25, .5, 1, 2, 5].map(value => ({ label: `${value} local px`, value })),
]
