import type { ChronoScene } from '../../../types'
import { CommittedSnapshot } from './CommittedSnapshot'

/** Observable committed source, independent of React renders and transient drag
 * previews. Borrowed immutable scenes are never cloned here. Subscribers run
 * synchronously after a successful commit/reset/undo/redo; observer failures
 * cannot roll back an edit. The subscriber owns its idempotent unsubscribe.
 */
export class CommittedScene extends CommittedSnapshot<ChronoScene> {
  getScene = (): ChronoScene => this.getSnapshot()
}
