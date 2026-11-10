import { actionRegistry } from '../../ai/ActionRegistry'
import { implementationToolName } from '../tools/ToolCatalogPolicy'
import { SourceAccessError } from './SourceAccessError'
import { READ_ACCESS_TTL_MS } from './ReadAccessRegistry'

/** Advertised protocol contract; mandatory guards cannot be disabled by the
 * catalog's legacy profile or by choosing a different spelling of an action. */
export const SOURCE_EDITING_CAPABILITIES = Object.freeze({ version: 1, required: true, readTool: 'get_scene',
  fields: ['expectedRevision', 'readToken'], tokenTtlMs: READ_ACCESS_TTL_MS, oneUse: true,
  scope: ['clientConnection', 'editorSession', 'documentEpoch', 'revision'],
  batchAuthorization: 'outer-call', dryRunAuthorization: 'returns-plan-bound-readToken',
  legacyMutationBypass: false })

const SOURCE_EXTRAS = new Set(['run_script', 'apply_script_plan', 'batch_actions', 'load_project',
  'import_asset', 'normalize_audio_clip', 'undo', 'redo', 'apply_scene'])

/** Authored-source policy, separate from readOnlyHint (which also accounts for
 * local file writes). Native commands derive from their owning registry. File
 * exports, runtime controls and reads do not require a source-write lease.
 * Call after action bootstrap; unknown names must still be schema-rejected. */
export function isSourceMutation(name: string): boolean {
  const implementation = implementationToolName(name)
  return SOURCE_EXTRAS.has(implementation) || !!actionRegistry.get(implementation)?.toCommand
}

/** A batch has one outer authorization. Sub-action validation checks its native
 * payload without pretending each sub-action has a separate source revision. */
export function assertSourceFields(name: string, args: Record<string, unknown>): void {
  if (!isSourceMutation(name)) return
  if (!Number.isSafeInteger(args?.expectedRevision) || Number(args.expectedRevision) < 0) throw new SourceAccessError('EXPECTED_REVISION_REQUIRED')
  if (typeof args?.readToken !== 'string' || !/^[a-f0-9]{64}$/.test(args.readToken)) throw new SourceAccessError('SOURCE_READ_REQUIRED')
}
