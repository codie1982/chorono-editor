import { extra } from '../tools/extraTool'
import { splineOperationSchema } from '../../editor/spline/operations/schema'
const timeMs = { type: 'number', minimum: 0, description: 'Deterministic composition time in ms; default current editor playhead. Keys are not retimed.' }
const timelineIds = { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', description: 'One existing timeline ID.' }, description: 'Optional nonempty timeline set for deterministic parent/driver evaluation; required in state-machine scenes.' }
/** One lifecycle, not parallel synonyms for every spline action. Both native
 * scripts and source edits retain their own authorization/preview contracts. */
export const SPLINE_TOOLS = [
  extra('prepare_spline_edit',
    'Prepare one explicit native spline edit without changing scene/history. Covers Point/Edge/Object topology, append/Continue/Auto Close, transforms, independent paint, Attach/Detach, Offset/Chamfer/Fillet and editable Boolean recipes. Uses native guards and bounded workers. Read get_scene first; returns planId, a NEW plan-bound readToken/revision, result IDs, changeSummary and an actual PNG by default. Inspect then apply_spline_edit or discard_spline_edit. Plans expire after five minutes; no UI selection or snap preferences change.', {
      layerId: { type: 'string', minLength: 1, maxLength: 128, description: 'Existing source spline layer. Required except for Boolean, whose targets/ownerId identify its inputs.' },
      operation: splineOperationSchema(), timeMs, timelineIds,
      previewWidth: { oneOf: [{ const: 0 }, { type: 'integer', minimum: 16, maximum: 1280 }], description: 'Default min(640, composition.width). Returns an actual draft PNG; 0 explicitly requests metadata only. Preview limit is 4,194,304 pixels.' },
    }, ['operation']),
  extra('apply_spline_edit',
    'Commit the exact unconsumed native spline plan from prepare_spline_edit once as one Undo. Reuses all generated IDs; no solver rerun. Requires the returned planId, revision and NEW plan-bound readToken in the same client/editor/document. Manual edits, active transactions, foreign/script/expired plans refuse. Returns revision, result IDs and bounded source changeSummary.', {
      planId: { type: 'string', description: 'Unconsumed spline planId returned by prepare_spline_edit within five minutes.' },
    }, ['planId']),
  extra('discard_spline_edit',
    'Cancel a prepared native spline edit and revoke its plan-bound token without changing scene/history/playback. Requires the same connected client/editor and spline planId; no source read token is needed. Missing/already-discarded plans return discarded:false. Foreign or script plans refuse. Preparing another operation does not silently overwrite a prior plan.', {
      planId: { type: 'string', description: 'Spline planId to release. Obtain it from prepare_spline_edit, not the Script Console.' },
    }, ['planId'], true),
]
SPLINE_TOOLS[0].inputSchema.allOf = [{ if: { properties: { operation: { properties: { kind: { const: 'boolean' } }, required: ['kind'] } }, required: ['operation'] }, then: {}, else: { required: ['layerId'] } }]
