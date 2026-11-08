/** Small scalar metadata retained after parsing. Full Lottie layers/assets are
 * deliberately not retained by the metadata reader or its handler. */
export interface LottieMetadata {
  readonly v?: string
  readonly w?: number
  readonly h?: number
  readonly fr?: number
  readonly durationMs: number
  readonly layerCount: number
}

/** Convert decoded JSON text to finite scalar metadata. Syntax errors/non-object
 * roots preserve the prior null-metadata behavior; runtime/resource failures
 * propagate. UTF-8 text/binary limits belong to the reader, not this converter.
 * JSON.parse creates platform-managed temporary objects; they are not a measured
 * or hard-capped heap estimate. Only the small returned record survives this call.
 * Frames/fps convert to milliseconds using the existing rounded duration rule. */
export function parseLottieMetadata(text: string): LottieMetadata | null {
  let value: unknown
  try { value = JSON.parse(text) } catch (error) { if (error instanceof SyntaxError) return null; throw error }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const data = value as Record<string, unknown>
  const finite = (key: string): number | undefined => typeof data[key] === 'number' && Number.isFinite(data[key]) ? data[key] : undefined
  const fr = finite('fr'), ip = finite('ip') ?? 0, op = finite('op')
  const duration = fr && op ? Math.round((op - ip) / fr * 1000) : 0
  return Object.freeze({ v: typeof data.v === 'string' ? data.v : undefined,
    w: finite('w'), h: finite('h'), fr, durationMs: Number.isFinite(duration) ? duration : 0,
    layerCount: Array.isArray(data.layers) ? data.layers.length : 0 })
}
