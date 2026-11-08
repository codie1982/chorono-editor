import { editorResourceBudget } from '../../resources/budget'
import { editorMediaPreparation } from '../../resources/jobs'
import { MediaProbeService } from './MediaProbeService'

/** Realm composition root, deliberately separate from pure worker parsers.
 * Native/preview work borrows the same 512 MiB ledger and two aggregate slots;
 * module initialization performs no IO, DOM construction or timer creation. */
export const editorMediaProbes = new MediaProbeService({ budget: editorResourceBudget, executor: editorMediaPreparation })
