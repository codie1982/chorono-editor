/** Safe expression parser and evaluator for parameter wiring (BL-05).
 *  Whitelist-only functions: no eval(), no dynamic code generation.
 *  Deterministic: same input → same output always.
 */

// ── Whitelist of safe functions ────────────────────────────────────────────────

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

// ── AST Types ──────────────────────────────────────────────────────────────────

export interface ExpressionAST {
  type: 'Literal' | 'Identifier' | 'CallExpression' | 'BinaryExpression' | 'UnaryExpression'
  value?: number
  name?: string
  callee?: ExpressionAST
  arguments?: ExpressionAST[]
  operator?: string
  argument?: ExpressionAST
  left?: ExpressionAST
  right?: ExpressionAST
}

// ── Lexer (Tokenizer) ──────────────────────────────────────────────────────────

interface Token {
  type: 'number' | 'identifier' | 'lparen' | 'rparen' | 'comma' | 'operator' | 'eof'
  value: string
}

/** Tokenize decimal/scientific numbers without consuming binary signs. Signs
 * belong to an exponent only immediately after e/E. Text/token budgets bound
 * parsing work; literals must be finite IEEE-754 numbers. */
function tokenize(expr: string): Token[] {
  if (expr.length > 4096) throw new SyntaxError('Expression exceeds 4096 characters')
  const tokens: Token[] = []
  let i = 0

  while (i < expr.length) {
    if (tokens.length >= 1024) throw new SyntaxError('Expression exceeds 1024 tokens')
    const ch = expr[i]

    // Whitespace
    if (/\s/.test(ch)) {
      i++
      continue
    }

    // Number (including decimals and scientific notation)
    if (/[0-9.]/.test(ch)) {
      const num = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(expr.slice(i))?.[0]
      if (!num || !Number.isFinite(Number(num))) throw new SyntaxError(`Invalid finite number at position ${i}`)
      i += num.length
      tokens.push({ type: 'number', value: num })
      continue
    }

    // Identifier or keyword
    if (/[a-zA-Z_]/.test(ch)) {
      let ident = ''
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) {
        ident += expr[i]
        i++
      }
      tokens.push({ type: 'identifier', value: ident })
      continue
    }

    // Operators: + - * / % ^ (power)
    if ('+-*/%^'.includes(ch)) {
      tokens.push({ type: 'operator', value: ch })
      i++
      continue
    }

    // Parentheses and comma
    if (ch === '(') {
      tokens.push({ type: 'lparen', value: '(' })
      i++
      continue
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ')' })
      i++
      continue
    }
    if (ch === ',') {
      tokens.push({ type: 'comma', value: ',' })
      i++
      continue
    }

    // Unknown character — reject
    throw new SyntaxError(`Unexpected character: '${ch}' at position ${i}`)
  }

  tokens.push({ type: 'eof', value: '' })
  return tokens
}

// ── Parser (Recursive Descent) ─────────────────────────────────────────────────

/** Bounded recursive-descent parser. Power is right-associative and binds
 * tighter than unary sign: -2^2 = -(2^2), while 2^-2 is supported. No state is
 * shared between parses. Tokens are borrowed for this parser's lifetime. */
class Parser {
  private readonly tokens: Token[]
  private current = 0
  private depth = 0

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  peek(): Token {
    return this.tokens[this.current] || { type: 'eof', value: '' }
  }

  advance(): Token {
    return this.tokens[this.current++]
  }

  expect(type: string): Token {
    const token = this.peek()
    if (token.type !== type) {
      throw new SyntaxError(`Expected ${type}, got ${token.type}`)
    }
    return this.advance()
  }

  parse(): ExpressionAST {
    const expr = this.parseExpression()
    if (this.peek().type !== 'eof') {
      throw new SyntaxError('Unexpected token after expression')
    }
    return expr
  }

  private parseExpression(): ExpressionAST {
    return this.parseBinaryExpression(0)
  }

  private parseBinaryExpression(minPrec: number): ExpressionAST {
    if (++this.depth > 64) throw new SyntaxError('Expression nesting exceeds 64 levels')
    try {
    let left = this.parseUnaryExpression()

    while (this.peek().type === 'operator') {
      const op = this.peek().value
      const prec = this.precedence(op)

      if (prec < minPrec) break

      this.advance()
      const right = this.parseBinaryExpression(op === '^' ? prec : prec + 1)

      left = {
        type: 'BinaryExpression',
        operator: op,
        left,
        right,
      }
    }

    return left
    } finally { this.depth-- }
  }

  private parseUnaryExpression(): ExpressionAST {
    if (this.peek().type === 'operator' && '+-'.includes(this.peek().value)) {
      const op = this.advance().value
      const arg = this.parseBinaryExpression(3)
      return {
        type: 'UnaryExpression',
        operator: op,
        argument: arg,
      }
    }

    return this.parsePrimary()
  }

  private parsePrimary(): ExpressionAST {
    const token = this.peek()

    // Number literal
    if (token.type === 'number') {
      this.advance()
      return {
        type: 'Literal',
        value: Number(token.value),
      }
    }

    // Identifier or function call
    if (token.type === 'identifier') {
      const ident = this.advance().value

      // Function call?
      if (this.peek().type === 'lparen') {
        this.advance() // consume '('
        const args: ExpressionAST[] = []

        if (this.peek().type !== 'rparen') {
          args.push(this.parseExpression())
          while (this.peek().type === 'comma') {
            this.advance() // consume ','
            args.push(this.parseExpression())
          }
        }

        this.expect('rparen')

        return {
          type: 'CallExpression',
          name: ident,
          arguments: args,
        }
      }

      // Plain identifier (variable)
      return {
        type: 'Identifier',
        name: ident,
      }
    }

    // Parenthesized expression
    if (token.type === 'lparen') {
      this.advance()
      const expr = this.parseExpression()
      this.expect('rparen')
      return expr
    }

    throw new SyntaxError(`Unexpected token: ${token.type}`)
  }

  private precedence(op: string): number {
    switch (op) {
      case '+':
      case '-':
        return 1
      case '*':
      case '/':
      case '%':
        return 2
      case '^':
        return 3
      default:
        return 0
    }
  }
}

// ── Evaluator ──────────────────────────────────────────────────────────────────

/** Evaluate a parsed AST against own finite numeric context values. Function
 * arity, safe-name ownership, 64-level depth and 1024-node budget are enforced.
 * Every intermediate/result must be finite; failures throw with a reason.
 * Trigonometric arguments are radians; other units belong to the caller. */
export function evaluateExpression(
  ast: ExpressionAST,
  context: Record<string, number>
): number {
  let remaining = 1024
  /** All recursive paths share one bounded budget; malformed/cyclic external
   * ASTs fail explicitly rather than overflowing or returning non-finite data. */
  function visit(ast: ExpressionAST, depth = 0): number {
    if (!ast || --remaining < 0 || depth > 64) throw new Error('Expression evaluation limit exceeded')
    const result = evaluateNode(ast, depth)
    if (!Number.isFinite(result)) throw new Error('Expression result must be a finite number')
    return result
  }
  function evaluateNode(ast: ExpressionAST, depth: number): number {
  switch (ast.type) {
    case 'Literal':
      return ast.value ?? 0

    case 'Identifier': {
      const name = ast.name ?? 's'
      if (!Object.prototype.hasOwnProperty.call(context, name)) {
        throw new Error(`Undefined variable: ${name}`)
      }
      return context[name]
    }

    case 'CallExpression': {
      const funcName = ast.name as SafeFunctionName
      if (!Object.prototype.hasOwnProperty.call(SAFE_FUNCTIONS, funcName)) {
        throw new Error(`Unknown function: ${funcName}`)
      }

      const func = SAFE_FUNCTIONS[funcName] as SafeFunctionValue
      const args = (ast.arguments ?? []).map((arg) => visit(arg, depth + 1))
      const variadic = funcName === 'min' || funcName === 'max'
      if (variadic ? args.length < 1 : args.length !== func.length) throw new Error(`${funcName} expects ${variadic ? 'at least 1' : func.length} arguments`)

      try {
        return (func as (...values: number[]) => number)(...args)
      } catch (err) {
        throw new Error(`Error in function ${funcName}: ${err}`)
      }
    }

    case 'BinaryExpression': {
      const left = visit(ast.left!, depth + 1)
      const right = visit(ast.right!, depth + 1)
      const op = ast.operator

      switch (op) {
        case '+':
          return left + right
        case '-':
          return left - right
        case '*':
          return left * right
        case '/':
          if (right === 0) throw new Error('Division by zero')
          return left / right
        case '%':
          return left % right
        case '^':
          return Math.pow(left, right)
        default:
          throw new Error(`Unknown operator: ${op}`)
      }
    }

    case 'UnaryExpression': {
      const arg = visit(ast.argument!, depth + 1)
      switch (ast.operator) {
        case '+':
          return arg
        case '-':
          return -arg
        default:
          throw new Error(`Unknown unary operator: ${ast.operator}`)
      }
    }

    default:
      throw new Error(`Unknown AST node type`)
  }
  }
  return visit(ast)
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Parse bounded numeric syntax into a fresh AST. Unknown variables/function
 * names and arity are checked against context during evaluation, not guessed
 * here. No implicit multiplication or implicit time variable is supported. */
export function parseExpression(expr: string): ExpressionAST {
  try {
    const tokens = tokenize(expr)
    const parser = new Parser(tokens)
    return parser.parse()
  } catch (err) {
    throw new Error(`Parse error: ${err}`)
  }
}

/** Evaluate an expression with given variable context.
 *  @param expr - Expression string (e.g., "map(s, 0, 1, 0, 360)")
 *  @param context - Variable bindings (e.g., { s: 0.5 })
 *  @returns Evaluated result
 *  @throws on parse error or evaluation error */
export function evaluate(expr: string, context: Record<string, number>): number {
  const ast = parseExpression(expr)
  return evaluateExpression(ast, context)
}

/** Safe evaluate: returns null on any error instead of throwing. */
export function safeEvaluate(expr: string, context: Record<string, number>): number | null {
  try {
    return evaluate(expr, context)
  } catch {
    return null
  }
}

/** Shared UI/runtime validation result. Unknown variables/functions, wrong
 * arity, arithmetic/domain errors and non-finite values carry a useful reason.
 * No fallback value is fabricated. Context units belong to the caller. */
export function inspectExpression(expr: string, context: Record<string, number>): { value: number | null; error: string | null } {
  try { return { value: evaluate(expr, context), error: null } }
  catch (error) { return { value: null, error: error instanceof Error ? error.message : String(error) } }
}
