import type { ScriptHost } from '../types'
import type { EditorCommand } from '../../editor/commands-keyframe'
import { assertSafeScriptData } from '../api/scriptData'
import { assertScript2DTransition } from './Script2DScope'
import { assertScriptLayerValues, assertScriptPropertyValue } from './ScriptLayerValues'
import { sameScriptValue } from './ScriptDataChanges'

/** Per-facade source admission adapter. Borrows its host; retains no scene or
 * runtime resources. Each command executes once, is checked before publication,
 * and keeps native undo/authoring hints. Undo restores admitted snapshots and
 * intentionally does not revalidate legacy source. Native MCP command adapters
 * are composed separately and do not use this script-only policy. */
export class ScriptSourceHost implements ScriptHost {
  constructor(private readonly host: ScriptHost) {}
  getScene = () => this.host.getScene()
  applyCommand(command: EditorCommand): void {
    this.host.applyCommand({ ...command,
      get authoring() { return command.authoring },
      execute: before => {
        const after = command.execute(before)
        assertScript2DTransition(before, after)
        const previous = new Map(before.layers.map(layer => [layer.id, layer]))
        for (const layer of after.layers) if (previous.get(layer.id) !== layer) {
          assertSafeScriptData(layer)
          assertScriptLayerValues(previous.get(layer.id), layer, after)
        }
        for (const timeline of after.timelines) {
          const old = before.timelines.find(item => item.id === timeline.id)
          if (old === timeline) continue
          for (const track of timeline.tracks) {
            const previousTrack = old?.tracks.find(item => item.target === track.target)
            if (track === previousTrack) continue
            const match = /^layers\.([^.]+)\.(.+)$/.exec(track.target)
            const layer = match && after.layers.find(item => item.id === match[1])
            const keys = new Map(previousTrack?.keyframes.map(key => [key.id, key]))
            for (const key of track.keyframes) if (!sameScriptValue(key.value, keys.get(key.id)?.value)) {
              assertSafeScriptData(key.value)
              if (layer && match) assertScriptPropertyValue(layer, match[2], key.value, true, after)
            }
          }
        }
        return after
      },
    })
  }
}
