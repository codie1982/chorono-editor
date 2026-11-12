import type { ChronoScene } from '../../types'
import type { AuthoringHints, AuthoringStamp } from '../../types/authoring'
import type { EditorCommand } from '../commands-keyframe'
import { attributeSourceChange } from './Attribution'
import { authoringKey, indexSourceEntities } from './SourceEntities'
import { AuthoringHintCollector } from './AuthoringHints'
import { assertScenePropertyExpressions } from '../../expression/properties/PropertyExpression'
import { assertNumericInputExpressions } from '../inputExpressions/NumericInputExpression'

/** Attach a trusted adapter's context without losing subtype results or lazy
 * copy hints populated by execute. The original command is not mutated. */
export function withAuthoringStamp<T extends EditorCommand>(command: T, stamp: AuthoringStamp): T {
  return { ...command, get authoring() { return { ...command.authoring, stamp } } }
}

/** Collect explicit native copy lineage. Existing clone metadata supplies layer
 * ID maps; nested spline records keep IDs scoped to their new layer. Copied
 * tracks/keys require explicit hints from the clone command, never time/name
 * matching. Batches retain hints; scripts carry them out of their sandbox as
 * transport metadata. No attribution is stamped during preparation/preview.
 */
export function commandAuthoringHints(command: EditorCommand): AuthoringHints {
  const clone = command as EditorCommand & { layerMetadata?: Record<string, { sourceId: string }>; authoring?: AuthoringHints }
  const copies = [...(command.authoring?.copies ?? [])]
  for (const [id, metadata] of Object.entries(clone.layerMetadata ?? {})) copies.push({ from: ['layer', metadata.sourceId], to: ['layer', id] })
  const collector = new AuthoringHintCollector()
  collector.add({ ...command.authoring, copies })
  return { ...command.authoring, ...collector.hints }
}

/** Expand known layer lineage to its normalized spline identities. Borrowed
 * indices exist only during this commit; no source values enter the hints. */
function expandedHints(before: ChronoScene, next: ChronoScene, hints: AuthoringHints): AuthoringHints {
  if (!hints.copies?.length) return hints
  const previous = indexSourceEntities(before), current = indexSourceEntities(next), copies = [...hints.copies]
  for (const copy of hints.copies) if (copy.from[0] === 'layer' && copy.to[0] === 'layer') {
    for (const source of Array.from(previous.entries.values())) if (source.address[0] === 'spline' && source.address[1] === copy.from[1]) {
      const target = ['spline', copy.to[1], source.address[2], source.address[3]] as const
      if (current.entries.has(authoringKey(target))) copies.push({ from: source.address, to: target })
    }
  }
  const collector = new AuthoringHintCollector(); collector.add({ ...hints, copies })
  return { ...hints, ...collector.hints }
}

/** Execute once and stamp once at the editor's atomic commit boundary. Default
 * browser commands are human; MCP passes broker-created agent context. Undo/redo
 * restores snapshots directly and must not call this helper. Command execute
 * semantics and source values remain unchanged; failures publish no ledger.
 */
export function executeAuthoredCommand(command: EditorCommand, before: ChronoScene, fallback?: AuthoringStamp): ChronoScene {
  const next = command.execute(before), hints = commandAuthoringHints(command)
  assertScenePropertyExpressions(next)
  next.layers.forEach(assertNumericInputExpressions)
  const stamp: AuthoringStamp = hints.stamp ?? fallback ?? { actor: { kind: 'human' }, transactionId: globalThis.crypto?.randomUUID?.() }
  return attributeSourceChange(before, next, stamp, expandedHints(before, next, hints))
}
