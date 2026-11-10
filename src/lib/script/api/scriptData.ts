import { readPropertyPath } from '../../scene/properties/readPropertyPath'
export type DeepPartial<T> = T extends readonly unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T
const unsafe = new Set(['__proto__', 'prototype', 'constructor'])
export function assertSafeScriptData(value: unknown): void {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Script data must contain finite numbers.')
  if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
    if (unsafe.has(key)) throw new Error(`Unsafe property: ${key}`)
    assertSafeScriptData(item)
  }
}
/** Reads return detached JSON data, never a handle to editor state or a native object. */
export function copyScriptData<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T
}
/** Objects merge recursively; arrays/scalars/null replace. Neither argument is mutated. */
export function mergeScriptData<T>(base: T, patch: DeepPartial<T>): T {
  assertSafeScriptData(patch)
  const merge = (current: unknown, update: unknown): unknown => {
    if (!update || typeof update !== 'object' || Array.isArray(update)) return copyScriptData(update)
    const result: Record<string, unknown> = current && typeof current === 'object' && !Array.isArray(current)
      ? { ...current as Record<string, unknown> } : {}
    for (const [key, value] of Object.entries(update)) result[key] = merge(result[key], value)
    return result
  }
  return merge(base, patch) as T
}
export function readScriptPath(value: unknown, path: string): unknown {
  const result = readPropertyPath(value, path)
  return result === undefined ? null : copyScriptData(result)
}
