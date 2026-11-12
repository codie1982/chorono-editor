/** Serializable-in-memory syntax only; source JSON stores formula text, never
 * ASTs. Optional fields preserve the legacy external AST API. Evaluation
 * rejects malformed/cyclic structures under its independent execution budget. */
export interface ExpressionAST {
  type: 'Literal' | 'Identifier' | 'CallExpression' | 'BinaryExpression' | 'UnaryExpression' | 'ConditionalExpression'
  value?: number | boolean | string
  name?: string
  callee?: ExpressionAST
  arguments?: ExpressionAST[]
  operator?: string
  argument?: ExpressionAST
  left?: ExpressionAST
  right?: ExpressionAST
  test?: ExpressionAST
  consequent?: ExpressionAST
  alternate?: ExpressionAST
}
interface Token { type: 'number' | 'string' | 'identifier' | 'lparen' | 'rparen' | 'comma' | 'operator' | 'question' | 'colon' | 'eof'; value: string }
const precedence: Readonly<Record<string, number>> = { '||': 1, '&&': 2, '==': 3, '!=': 3, '===': 3, '!==': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6, '^': 7 }

/** Bound text/token allocation and reject partial numbers, access, assignment
 * and unknown punctuation. Longest operators win; signs belong to exponents
 * only immediately after e/E. Boolean constant names keep identifier syntax
 * so explicitly bound v1 numeric references remain compatible. */
function tokenize(expr: string): Token[] {
  if (expr.length > 4096) throw new SyntaxError('Expression exceeds 4096 characters')
  const tokens: Token[] = []
  let index = 0
  while (index < expr.length) {
    if (tokens.length >= 1024) throw new SyntaxError('Expression exceeds 1024 tokens')
    const ch = expr[index]
    if (/\s/.test(ch)) { index++; continue }
    if (ch === '"' || ch === "'") {
      const quote = ch; let text = '', closed = false; index++
      while (index < expr.length) {
        const character = expr[index++]
        if (character === quote) { closed = true; break }
        if (character.charCodeAt(0) < 32) throw new SyntaxError('Raw control character in string')
        if (character !== '\\') { text += character; continue }
        const escape = expr[index++]
        const escapes: Readonly<Record<string, string>> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '\\': '\\', '"': '"', "'": "'", '/': '/' }
        if (escape === 'u') {
          const hex = expr.slice(index, index + 4)
          if (!/^[0-9a-f]{4}$/i.test(hex)) throw new SyntaxError('Invalid Unicode escape')
          text += String.fromCharCode(parseInt(hex, 16)); index += 4
        } else if (Object.hasOwn(escapes, escape)) text += escapes[escape]
        else throw new SyntaxError('Invalid string escape')
      }
      if (!closed) throw new SyntaxError('Unterminated string')
      tokens.push({ type: 'string', value: text }); continue
    }
    if (/[0-9.]/.test(ch)) {
      const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(expr.slice(index))?.[0]
      if (!number || !Number.isFinite(Number(number))) throw new SyntaxError(`Invalid finite number at position ${index}`)
      tokens.push({ type: 'number', value: number }); index += number.length; continue
    }
    const identifier = /^[A-Za-z_][A-Za-z0-9_]*/.exec(expr.slice(index))?.[0]
    if (identifier) { tokens.push({ type: 'identifier', value: identifier }); index += identifier.length; continue }
    const operator = /^(?:===|!==|==|!=|<=|>=|&&|\|\||[+*/%^<>!\-])/.exec(expr.slice(index))?.[0]
    if (operator) { tokens.push({ type: 'operator', value: operator }); index += operator.length; continue }
    const punctuation: Readonly<Record<string, Token['type']>> = { '(': 'lparen', ')': 'rparen', ',': 'comma', '?': 'question', ':': 'colon' }
    const type = punctuation[ch]
    if (!type) throw new SyntaxError(`Unexpected character: '${ch}' at position ${index}`)
    tokens.push({ type, value: ch }); index++
  }
  return [...tokens, { type: 'eof', value: '' }]
}

/** Per-parse bounded recursive-descent state. Arithmetic keeps legacy order:
 * ^ is right associative and tighter than unary +/-; ?: is right associative
 * and looser than ||. Parser depth is capped at 64; it owns no runtime context. */
class Parser {
  private current = 0
  private depth = 0
  constructor(private readonly tokens: readonly Token[]) {}
  /** Borrow the next token without consuming it. */
  private peek(): Token { return this.tokens[this.current] ?? { type: 'eof', value: '' } }
  /** Consume one token; parsing owns this cursor exclusively. */
  private take(): Token { return this.tokens[this.current++] }
  /** Consume the required delimiter or fail instead of accepting a suffix. */
  private expect(type: Token['type']): void {
    if (this.peek().type !== type) throw new SyntaxError('Expected ' + type + ', got ' + this.peek().type)
    this.take()
  }
  /** Parse exactly one expression; no ignored suffix or implicit multiplication. */
  parse(): ExpressionAST {
    const ast = this.expression()
    this.expect('eof'); return ast
  }
  /** Lowest precedence, right-associative conditional with bounded recursion. */
  private expression(): ExpressionAST {
    if (++this.depth > 64) throw new SyntaxError('Expression nesting exceeds 64 levels')
    try {
      const test = this.binary(1)
      if (this.peek().type !== 'question') return test
      this.take(); const consequent = this.expression(); this.expect('colon')
      return { type: 'ConditionalExpression', test, consequent, alternate: this.expression() }
    } finally { this.depth-- }
  }
  /** Precedence climb; only power recurses at the same priority on the right. */
  private binary(minimum: number): ExpressionAST {
    if (++this.depth > 64) throw new SyntaxError('Expression nesting exceeds 64 levels')
    try {
      let left = this.unary()
      while (this.peek().type === 'operator') {
        const operator = this.peek().value, priority = precedence[operator] ?? -1
        if (priority < minimum) break
        this.take()
        left = { type: 'BinaryExpression', operator, left, right: this.binary(operator === '^' ? priority : priority + 1) }
      }
      return left
    } finally { this.depth-- }
  }
  /** Preserve power-before-sign while adding strict logical negation. */
  private unary(): ExpressionAST {
    if (this.peek().type === 'operator' && ['+', '-', '!'].includes(this.peek().value)) {
      const operator = this.take().value
      return { type: 'UnaryExpression', operator, argument: this.binary(7) }
    }
    return this.primary()
  }
  /** Parse a number, identifier, call or parenthesized expression. */
  private primary(): ExpressionAST {
    const token = this.take()
    if (token.type === 'number') return { type: 'Literal', value: Number(token.value) }
    if (token.type === 'string') return { type: 'Literal', value: token.value }
    if (token.type === 'identifier') {
      if (this.peek().type !== 'lparen') return { type: 'Identifier', name: token.value }
      this.take(); const args: ExpressionAST[] = []
      if (this.peek().type !== 'rparen') {
        args.push(this.expression())
        while (this.peek().type === 'comma') { this.take(); args.push(this.expression()) }
      }
      this.expect('rparen')
      return { type: 'CallExpression', name: token.value, arguments: args }
    }
    if (token.type === 'lparen') { const ast = this.expression(); this.expect('rparen'); return ast }
    throw new SyntaxError('Unexpected token: ' + token.type)
  }
}

/** Parse source through the shared safe language without running it. Names,
 * branch types and function arity are validated by the executed branch later. */
export function parseExpression(expr: string): ExpressionAST {
  try { return new Parser(tokenize(expr)).parse() }
  catch (error) { throw new Error('Parse error: ' + String(error)) }
}
