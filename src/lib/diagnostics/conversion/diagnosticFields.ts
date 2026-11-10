/** Read one own data field without executing getters or custom serialization.
 * This local conversion boundary accepts unknown records, not native Error or
 * class payloads. Proxy traps may throw; conversion then safely yields no field.
 * Unknown keys are never enumerated, copied, stringified or retained. */
export function diagnosticField(input: unknown, key: string): unknown {
  if (input === null || typeof input !== 'object') return
  try {
    const prototype = Object.getPrototypeOf(input)
    if (prototype !== Object.prototype && prototype !== null) return
    const field = Object.getOwnPropertyDescriptor(input, key)
    return field && 'value' in field ? field.value : undefined
  } catch { return undefined }
}
