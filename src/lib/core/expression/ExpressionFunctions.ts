const SAFE_FUNCTIONS = {
  // Remapping: map(source, inMin, inMax, outMin, outMax)
  map: (s: number, inMin: number, inMax: number, outMin: number, outMax: number): number => {
    const inRange = inMax - inMin
    if (inRange === 0) return outMin
    return outMin + ((s - inMin) * (outMax - outMin)) / inRange
  },

  // Clamping: clamp(value, min, max)
  clamp: (v: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, v)),

  // Linear interpolation: lerp(a, b, t)
  lerp: (a: number, b: number, t: number): number =>
    a + (b - a) * t,

  // Absolute value
  abs: Math.abs,

  // Min/max
  min: Math.min,
  max: Math.max,

  // Trigonometry
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,

  // Power/root
  sqrt: Math.sqrt,
  pow: Math.pow,
  cbrt: Math.cbrt,

  // Rounding
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,

  // Easing
  smoothstep: (t: number): number => t * t * (3 - 2 * t),
  smootherstep: (t: number): number => t * t * t * (t * (t * 6 - 15) + 10),

  // Absolute difference
  dist: (a: number, b: number): number => Math.abs(b - a),

  // Sign
  sign: Math.sign,
}

type SafeFunctionName = keyof typeof SAFE_FUNCTIONS
type SafeFunctionValue = typeof SAFE_FUNCTIONS[SafeFunctionName]

/** Apply a numeric whitelist function with explicit arity. Input arguments are
 * already finite numbers; no host lookup or user code can be called. */
export function callExpressionFunction(name: string, args: number[]): number {
  if (!Object.prototype.hasOwnProperty.call(SAFE_FUNCTIONS, name)) throw new Error('Unknown function: ' + name)
  const key = name as SafeFunctionName, func = SAFE_FUNCTIONS[key] as SafeFunctionValue
  const variadic = key === 'min' || key === 'max'
  if (variadic ? args.length < 1 : args.length !== func.length) throw new Error(`${name} expects ${variadic ? 'at least 1' : func.length} arguments`)
  return (func as (...values: number[]) => number)(...args)
}
