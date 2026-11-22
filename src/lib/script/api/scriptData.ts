import { readPropertyPath } from '../../scene/properties/readPropertyPath'
import { measureJson } from '../../format/json'
export type DeepPartial<T> = T extends readonly unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T
const unsafe = new Set(['__proto__', 'prototype', 'constructor'])
/** Bound plain source data before cloning/merging. The shared JSON preflight
 * rejects cycles, getters, native instances and custom serializers without
 * invoking them. Undefined remains an explicit optional-field clearing value;
 * functions/symbols/nonfinite numbers are never silently lost to JSON. */
export function assertSafeScriptData(value: unknown): void {
  measureJson({ value })
  const visit = (item: unknown): void => {
    if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('Script data must contain finite numbers.')
    if (['function','symbol','bigint'].includes(typeof item)) throw new Error('Script source accepts data, not executable or native values.')
    if (item && typeof item === 'object') {
      if (Object.getOwnPropertySymbols(item).length) throw new Error('Symbol source properties are unsupported.')
      if (Array.isArray(item)) for (let index = 0; index < item.length; index++) {
        if (!Object.hasOwn(item, index) || item[index] === undefined) throw new Error('Source arrays require explicit serializable elements.')
      }
      for (const [key, child] of Object.entries(item)) {
        if (unsafe.has(key)) throw new Error(`Unsafe property: ${key}`)
        visit(child)
      }
    }
  }
  visit(value)
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
