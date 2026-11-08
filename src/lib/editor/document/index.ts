import { SceneDocumentLoader } from './SceneDocumentLoader'
import { BoundedTextReader } from '../../resources/io'
import { editorResourceBudget } from '../../resources/budget'
import { editorImportPreparation } from '../../import/resources/editorImportPreparation'

export { SceneDocumentLoader } from './SceneDocumentLoader'
export type { SceneDocumentSource } from './SceneDocumentLoader'

/** Editor composition root: source preparation shares IO capacity and the same
 * 512 MiB managed ledger. Loading alone never replaces a document or creates UI. */
export const editorSceneDocumentLoader = new SceneDocumentLoader({ executor: editorImportPreparation,
  reader: new BoundedTextReader({ budget: editorResourceBudget }) })
