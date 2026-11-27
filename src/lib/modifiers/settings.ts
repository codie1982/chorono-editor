/** Validated numeric setting in the modifier's documented units; no clamping. */
export function numberSetting(settings: Readonly<Record<string, unknown>>, key: string, min: number, max: number): number {
  const value = settings[key]
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${key} must be between ${min} and ${max}.`)
  return value
}
/** Enum setting validation shared by descriptors' strategies, not their UI. */
export function enumSetting<T extends string>(settings: Readonly<Record<string, unknown>>, key: string, values: readonly T[]): T {
  const value = settings[key]
  if (typeof value !== 'string' || !values.includes(value as T)) throw new Error(`Invalid ${key}.`)
  return value as T
}
/** Empty target arrays mean all currently eligible elements. Explicit IDs are
 * validated against stage input before evaluation, never silently discarded. */
export function targetSetting(settings: Readonly<Record<string, unknown>>, key: string): string[] {
  const value = settings[key]
  if (!Array.isArray(value) || value.length > 8192 || value.some(id => typeof id !== 'string' || !id || id.length > 256)
    || new Set(value).size !== value.length) throw new Error(`Invalid ${key} selection.`)
  return value as string[]
}
