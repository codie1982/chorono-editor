// ── RuntimeExporter ───────────────────────────────────────────────────────────
//
// Orchestrator that ties validator + optimizer into a single `export(scene)`
// API. Returns a RuntimePackage containing the lean runtime JSON + any
// warnings. Throws RuntimeExportError on validation failures.

import type { ChronoScene } from '../types'
import type { RuntimePackage, RuntimeValidationResult } from '../types/runtime'
import { defaultRuntimeValidator, RuntimeValidator } from './RuntimeValidator'
import { defaultRuntimeOptimizer, RuntimeOptimizer } from './RuntimeOptimizer'

export class RuntimeExportError extends Error {
  constructor(message: string, public readonly validation: RuntimeValidationResult) {
    super(message)
    this.name = 'RuntimeExportError'
  }
}

export class RuntimeExporter {
  constructor(
    private validator: RuntimeValidator = defaultRuntimeValidator,
    private optimizer: RuntimeOptimizer = defaultRuntimeOptimizer,
  ) {}

  export(scene: ChronoScene): RuntimePackage {
    const validation = this.validator.validate(scene)
    if (validation.errors.length > 0) {
      throw new RuntimeExportError(
        `Runtime export failed: ${validation.errors.length} error(s)`,
        validation,
      )
    }
    return {
      version:  '1.0',
      runtime:  this.optimizer.optimize(scene),
      warnings: validation.warnings,
    }
  }
}

export const defaultRuntimeExporter = new RuntimeExporter()
