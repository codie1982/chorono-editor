import type { DiagnosticErrorCode, DiagnosticFailure, DiagnosticFailureSite, DiagnosticOperation,
  DiagnosticSample, DiagnosticViewportTool } from './types'

type Definition = Omit<DiagnosticFailure, 'failureSite'>
type Stage = 'preview' | 'commit' | 'rollback'
const stages: Readonly<Record<Stage, readonly [DiagnosticErrorCode, DiagnosticSample['outcome']]>> = {
  preview: ['EDIT_PREVIEW_FAILED', 'preview-failed'],
  commit: ['EDIT_COMMIT_FAILED', 'commit-failed'],
  rollback: ['UNEXPECTED_ROLLBACK', 'unexpected-rollback'],
}
const tools: Readonly<Record<DiagnosticViewportTool, DiagnosticOperation>> = {
  'object-move': 'move', 'object-rotate': 'rotate', 'object-scale': 'scale',
  'object-anchor': 'anchor', 'object-resize': 'resize', guide: 'guide',
  'shape-placement': 'shape-placement', 'motion-key': 'motion-key',
}

/** Build an immutable static definition; samples contain only registered codes. */
function definition(errorCode: DiagnosticErrorCode, module: DiagnosticFailure['module'],
  classification: DiagnosticFailure['classification'], severity: DiagnosticFailure['severity'],
  operation: DiagnosticOperation, outcome: DiagnosticSample['outcome']): Definition {
  return Object.freeze({ errorCode, module, classification, severity, sample: Object.freeze({ operation, outcome }) })
}

/** Module-private catalogue. Dynamic strings never extend it. Each viewport
 * failure has a static tool/stage site, so generic commit codes cannot merge
 * unrelated tools. Ordinary cancellation reasons have no catalogue entry. */
function createCatalogue(): ReadonlyMap<DiagnosticFailureSite, Definition> {
  const catalogue = new Map<DiagnosticFailureSite, Definition>()
  for (const tool of Object.keys(tools) as DiagnosticViewportTool[]) {
    for (const stage of Object.keys(stages) as Stage[]) {
      const [code, outcome] = stages[stage]
      catalogue.set(`viewport.${tool}.${stage}`, definition(code, 'viewport', 'known', 'error', tools[tool], outcome))
    }
  }
  catalogue.set('application.unhandled-error', definition('UNHANDLED_ERROR', 'application', 'unclassified', 'error', 'application', 'unhandled'))
  catalogue.set('application.unhandled-rejection', definition('UNHANDLED_REJECTION', 'application', 'unclassified', 'error', 'application', 'unhandled'))
  catalogue.set('application.render-failed', definition('RENDER_FAILED', 'application', 'known', 'fatal', 'application', 'render-failed'))
  return catalogue
}

const catalogue = createCatalogue()

/** Resolve only exact, registered sites. This catalogue does not infer failures
 * from source-cancel, blur, Escape, strings, exceptions or local trace history. */
export function diagnosticFailureAt(site: unknown): DiagnosticFailure | undefined {
  if (typeof site !== 'string' || site.length > 80) return
  const meaning = catalogue.get(site as DiagnosticFailureSite)
  return meaning ? Object.freeze({ ...meaning, failureSite: site as DiagnosticFailureSite }) : undefined
}
