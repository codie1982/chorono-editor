import { readPropertyPath } from './readPropertyPath'

/** Immutable authoring write. Clones only traversed containers, preserves array
 * topology, and rejects prototype keys and sparse/noncanonical array indices.
 * Missing object containers may be created only with explicit create=true,
 * preserving the former schema inspector contract. Unlike render projection,
 * this returns independently owned branches and holds no per-frame scratch. */
export function writePropertyPath<T extends object>(source: T, path: string, value: unknown, create = false): T {
  readPropertyPath(source, path)
  const keys = path.split('.')
  if (keys.length > 16 || keys.some(key => !key)) throw new Error('Invalid property path.')
  const write = (input: unknown, depth: number): unknown => {
    if ((!input || typeof input !== 'object') && !create) throw new Error('Missing property container.')
    const current = input && typeof input === 'object' ? input as Record<string, unknown> : {}
    const key = keys[depth]
    if (Array.isArray(input) && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= input.length)) throw new Error('Invalid array property index.')
    const next = depth === keys.length - 1 ? value : write(current[key], depth + 1)
    if (Object.is(current[key], next)) return input
    const result = Array.isArray(input) ? input.slice() : { ...current }
    Object.defineProperty(result, key, { value: next, enumerable: true, writable: true, configurable: true })
    return result
  }
  return write(source, 0) as T
}
