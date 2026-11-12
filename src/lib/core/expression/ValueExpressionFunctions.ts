import { parseAnimatableColor, type ColorValue } from '../../color/ColorValue'
import { isVec2, vec2 } from '../../geometry/CoordinateSystem'
import { callExpressionFunction } from './ExpressionFunctions'
import { MAX_EXPRESSION_STRING, type ExpressionValue } from './ExpressionValue'

/** Exact finite number argument, never JS coercion. */
function number(value: ExpressionValue): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Function requires a finite number')
  return value
}
/** Exact bounded string argument. */
function text(value: ExpressionValue): string {
  if (typeof value !== 'string' || value.length > MAX_EXPRESSION_STRING) throw new Error('Function requires a bounded string')
  return value
}
/** Decode a valid CSS/canonical color with the application's shared parser. */
function color(value: ExpressionValue): ColorValue {
  const parsed = parseAnimatableColor(value)
  if (!parsed) throw new Error('Function requires a color')
  return parsed
}
/** Enforce constructor/function arity before reading arguments. */
function arity(args: readonly ExpressionValue[], size: number, name: string): void {
  if (args.length !== size) throw new Error(name + ' expects ' + size + ' arguments')
}

/** Data-only typed whitelist extending the one numeric function implementation.
 * rgba uses CSS alpha 0..1 and RGB 0..255; returned ColorValue alpha is 0..255.
 * String concatenation is explicit and bounded; no member lookup, format code,
 * reflection or host callbacks are available. Returned records are fresh. */
export function callValueExpressionFunction(name: string, args: ExpressionValue[]): ExpressionValue {
  if (name === 'concat') {
    if (!args.length) throw new Error('concat expects at least 1 argument')
    let result = ''
    for (const value of args) { const next = text(value); if (result.length + next.length > MAX_EXPRESSION_STRING) throw new Error('String result exceeds 4096 characters'); result += next }
    return result
  }
  if (name === 'str') {
    arity(args, 1, name)
    if (!['number', 'boolean', 'string'].includes(typeof args[0])) throw new Error('str requires a scalar')
    return String(args[0])
  }
  if (name === 'fixed') {
    arity(args, 2, name); const digits = number(args[1])
    if (!Number.isInteger(digits) || digits < 0 || digits > 12) throw new Error('fixed digits must be an integer from 0 to 12')
    return number(args[0]).toFixed(digits)
  }
  if (name === 'vec2') { arity(args, 2, name); return vec2(number(args[0]), number(args[1])) }
  if (name === 'x' || name === 'y') {
    arity(args, 1, name); if (!isVec2(args[0])) throw new Error('Component requires vec2')
    return args[0][name]
  }
  if (name === 'rgb' || name === 'rgba') {
    arity(args, name === 'rgb' ? 3 : 4, name)
    const channels = args.map(number)
    if (channels.slice(0, 3).some(channel => channel < 0 || channel > 255) || channels[3] !== undefined && (channels[3] < 0 || channels[3] > 1)) throw new Error('RGB channels must be 0..255 and alpha 0..1')
    return { r: channels[0], g: channels[1], b: channels[2], a: (channels[3] ?? 1) * 255 }
  }
  if (name === 'color') { arity(args, 1, name); return color(args[0]) }
  if (['red', 'green', 'blue', 'alpha'].includes(name)) {
    arity(args, 1, name); const value = color(args[0])
    return name === 'red' ? value.r : name === 'green' ? value.g : name === 'blue' ? value.b : value.a / 255
  }
  return callExpressionFunction(name, args.map(number))
}
