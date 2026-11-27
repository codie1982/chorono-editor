/** Arc-length dash intervals using SVG odd-array repetition and signed offset.
 * Pattern resets at each contour. Zero-length visible dashes are retained for
 * round/square dots; zero gaps join touching intervals. A closed seam's first
 * and last intervals are stitched, avoiding artificial caps. Bounded immutable
 * output; negative distances in a seam interval wrap once around the contour.
 * https://www.w3.org/TR/SVG/painting.html#StrokeDashing */
export function bandDashIntervals(length: number, closed: boolean, enabled: boolean, values: readonly number[], offset: number): { from: number; to: number; closed: boolean }[] {
  if (!enabled) return [{ from: 0, to: length, closed }]
  const dash = values.length % 2 ? [...values, ...values] : [...values], period = dash.reduce((a, b) => a + b, 0)
  const phase = ((offset % period) + period) % period
  const intervals: { from: number; to: number; closed: boolean }[] = []
  let position = -phase, cursor = 0, steps = 0
  while (position <= length) {
    if (++steps > 32768) throw new Error('Outline dash budget exceeded. Increase dash/gap lengths.')
    const size = dash[cursor], end = position + size
    if (cursor % 2 === 0 && end >= 0 && position <= length) {
      const from = Math.max(0, position), to = Math.min(length, end), previous = intervals.at(-1)
      if (previous && Math.abs(previous.to - from) < 1e-9) previous.to = to
      else intervals.push({ from, to, closed: false })
      if (intervals.length > 1024) throw new Error('Outline has too many visible dashes.')
    }
    position = end; cursor = (cursor + 1) % dash.length
  }
  if (closed && intervals.length && intervals[0].from === 0 && intervals.at(-1)!.to === length) {
    if (intervals.length === 1) intervals[0].closed = true
    else { const last = intervals.pop()!; intervals[0].from = last.from - length }
  }
  return intervals
}
