/** Borrow an own-property value from serializable source; no creation, cloning
 * or mutation. Missing leaves and empty intermediate segments return undefined.
 * An absent path or unsafe segment throws. Script adapters may detach the
 * result at their transport boundary. */
export function readPropertyPath(value: unknown, path: string): unknown {
  if (typeof path !== 'string' || !path.length) throw new Error('A property path is required.')
  let current = value
  for (const key of path.split('.')) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error(`Unsafe property: ${key}`)
    if (!key || !current || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, key)) return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}
