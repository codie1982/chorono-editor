import { parseExpression, type ExpressionAST } from './expressionEvaluator'

export interface ExpressionProgram { readonly ast: ExpressionAST | null; readonly error: string | null }

/** Bounded shared whitelist-parser cache, keyed only by formula text. It owns
 * at most capacity AST/error entries, never scenes, DOM handles or variable
 * contexts. LRU access is deterministic; clear releases all owned programs.
 * Parsing limits remain the canonical parser's responsibility. */
export class ExpressionProgramCache {
  private readonly programs = new Map<string, ExpressionProgram>()
  constructor(private readonly capacity = 512) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 4096) throw new Error('Invalid expression cache capacity.')
  }
  /** Borrow a compiled immutable-by-contract AST/error. Never execute a formula. */
  get(formula: string): ExpressionProgram {
    const cached = this.programs.get(formula)
    if (cached) { this.programs.delete(formula); this.programs.set(formula, cached); return cached }
    let result: ExpressionProgram
    try { result = { ast: parseExpression(formula), error: null } }
    catch (error) { result = { ast: null, error: error instanceof Error ? error.message : String(error) } }
    if (this.programs.size >= this.capacity) this.programs.delete(this.programs.keys().next().value!)
    this.programs.set(formula, result)
    return result
  }
  /** Current owned program count, for lifecycle/budget diagnostics. */
  get size(): number { return this.programs.size }
  /** Drop programs; callers holding a borrowed AST may finish their current pass. */
  clear(): void { this.programs.clear() }
}

/** Shared numeric Wire/property programs. No source identity is retained. */
export const expressionPrograms = new ExpressionProgramCache()
