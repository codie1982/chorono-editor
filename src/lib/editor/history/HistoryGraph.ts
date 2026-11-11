import { assertNumericInputExpressions } from '../inputExpressions/NumericInputExpression'
import type { ChronoScene } from '../../types'
import type { HistoryState } from '../history'
import { isChoronoScene } from '../../format/scene/SceneJsonConverter'
import { assertAuthoringData } from '../authoring/AuthoringValidation'
import { assertSceneGuides } from '../../geometry/guides/sceneGuideData'
import { measureJson } from '../../format/json'
import { HistorySourceView } from './HistorySourceView'
import { limitHistory, nearestHistory, HISTORY_POLICY, type HistoryPolicy } from './historyBudget'

type Atom = null | string | number | boolean | [0 | 1 | 2 | 3, number]
type Node = { array: Atom[] } | { object: [string, Atom][] }
export interface HistoryGraph { version: 1; nodes: Node[]; strings?: string[]; past: Atom[]; future: Atom[]; droppedSteps: number }
export const HISTORY_GRAPH_BYTES = 16 * 1024 ** 2
const preparedGraphs = new WeakMap<HistoryState, HistoryGraph>()

/** Index JSON object occurrences in deterministic preorder. Aliases are visited
 * at every serialized occurrence so indices match JSON.parse; encode references
 * use the first occurrence. Undefined object fields are omitted like JSON. */
function baseObjects(value: unknown, all: object[], first?: WeakMap<object, number>, depth = 0, path = new Set<object>(), strings?: string[], firstStrings?: Map<string, number>): void {
  if (typeof value === 'string') { if (strings) { if (!firstStrings?.has(value)) firstStrings?.set(value, strings.length); strings.push(value) }; return }
  if (!value || typeof value !== 'object') return
  if (depth > 48 || all.length > 300000 || path.has(value)) throw new RangeError('Unsupported history base structure.')
  if (!first?.has(value)) first?.set(value, all.length)
  all.push(value); path.add(value)
  if (Array.isArray(value)) for (const item of value) baseObjects(item, all, first, depth + 1, path, strings, firstStrings)
  else for (const key of Object.keys(value)) if ((value as Record<string, unknown>)[key] !== undefined) baseObjects((value as Record<string, unknown>)[key], all, first, depth + 1, path, strings, firstStrings)
  path.delete(value)
}

/** Versioned DAG relative to current source: unchanged subtrees refer to base
 * indices; historic changed nodes are stored once across all steps. Restores
 * shared references instead of duplicating a full project for every key edit.
 * Encoding keeps contiguous nearest states within count/memory and a conservative
 * 16 MiB graph policy; older dropped steps are reported. Source is immutable.
 */
export function encodeHistory(input: HistoryState, maxBytes = HISTORY_GRAPH_BYTES): HistoryGraph {
  if (maxBytes === HISTORY_GRAPH_BYTES && preparedGraphs.has(input)) return preparedGraphs.get(input)!
  const limited = limitHistory(input), state = limited.history, views = new HistorySourceView()
  const graph: HistoryGraph = { version: 1, nodes: [], past: [], future: [], droppedSteps: limited.droppedSteps }
  if (!state.past.length && !state.future.length) return graph
  const first = new WeakMap<object, number>(), base: object[] = [], indices = new Map<object, number>(), originals: object[] = []
  const baseStrings: string[] = [], firstStrings = new Map<string, number>(), storedStrings = new Map<string, number>()
  graph.strings = []
  try { baseObjects(views.get(state.present), base, first, 0, new Set(), baseStrings, firstStrings) }
  catch (error) { if (!(error instanceof RangeError)) throw error; graph.droppedSteps += state.past.length + state.future.length; return graph }
  let charged = 128
  const encode = (value: unknown, path = new Set<object>(), depth = 0): Atom => {
    if (depth > 48) throw new RangeError('History depth exceeded.')
    if (value === undefined) return null
    if (typeof value === 'string' && value.length >= 256) {
      charged += 32
      const current = firstStrings.get(value); if (current !== undefined) return [2, current]
      const old = storedStrings.get(value); if (old !== undefined) return [3, old]
      charged += measureJson(value, { maxChars: maxBytes, maxBytes }).utf8Bytes
      if (charged > maxBytes) throw new RangeError('History string budget exceeded.')
      const index = graph.strings!.length; graph.strings!.push(value); storedStrings.set(value, index); return [3, index]
    }
    if (value === null || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') {
      charged += typeof value === 'string' ? value.length * 6 + 16 : 32
      if (typeof value === 'number' && !Number.isFinite(value) || charged > maxBytes) throw new RangeError('History graph budget exceeded.')
      return value
    }
    if (typeof value !== 'object' || path.has(value)) throw new TypeError('History must contain acyclic JSON source.')
    const current = first.get(value); if (current !== undefined) { charged += 32; return [0, current] }
    const old = indices.get(value); if (old !== undefined) { charged += 32; return [1, old] }
    if (graph.nodes.length >= 100000 || charged > maxBytes) throw new RangeError('History graph node budget exceeded.')
    const index = graph.nodes.length, node: Node = Array.isArray(value) ? { array: [] } : { object: [] }
    indices.set(value, index); originals.push(value); graph.nodes.push(node); charged += 128; path.add(value)
    if ('array' in node) for (const item of value as unknown[]) node.array.push(encode(item, path, depth + 1))
    else for (const key of Object.keys(value)) {
      const property = Object.getOwnPropertyDescriptor(value, key)
      if (!property || !('value' in property)) throw new TypeError('History accessors are unsupported.')
      if (property.value === undefined) continue
      charged += key.length * 6 + 32; node.object.push([key, encode(property.value, path, depth + 1)])
    }
    path.delete(value); if (charged > maxBytes) throw new RangeError('History graph byte budget exceeded.')
    return [1, index]
  }
  const past: Atom[] = [], future: Atom[] = []
  for (const candidate of nearestHistory(state)) {
    const beforeNodes = graph.nodes.length, beforeBytes = charged, beforeStrings = graph.strings!.length
    try { (candidate.side === 'past' ? past : future).push(encode(views.get(state[candidate.side][candidate.index]))) }
    catch (error) {
      for (const original of originals.splice(beforeNodes)) indices.delete(original)
      for (const text of graph.strings!.splice(beforeStrings)) storedStrings.delete(text)
      graph.nodes.length = beforeNodes; charged = beforeBytes
      if (!(error instanceof RangeError)) throw error
      break
    }
  }
  graph.past = past.reverse(); graph.future = future
  graph.droppedSteps += state.past.length + state.future.length - past.length - future.length
  measureJson(graph, { maxChars: maxBytes, maxBytes, maxNodes: 1000000 })
  return graph
}

/** Apply one retention contract to RAM and persisted graphs. A graph-byte cap
 * can additionally shorten both contiguous stacks. Cache only by weak immutable
 * history identity; active/current/pending owners bound the live cache keys. */
export function prepareHistory(input: HistoryState, policy: Readonly<HistoryPolicy> = HISTORY_POLICY): ReturnType<typeof limitHistory> {
  const limited = limitHistory(input, policy)
  let graph: HistoryGraph
  try { graph = encodeHistory(limited.history) }
  catch (error) {
    if (!(error instanceof RangeError)) throw error
    graph = { version: 1, nodes: [], past: [], future: [], droppedSteps: input.past.length + input.future.length }
  }
  const total = input.past.length + input.future.length
  const history = graph.past.length === limited.history.past.length && graph.future.length === limited.history.future.length ? limited.history : {
    present: limited.history.present, past: graph.past.length ? limited.history.past.slice(-graph.past.length) : [], future: limited.history.future.slice(0, graph.future.length),
  }
  preparedGraphs.set(history, graph)
  return { ...limited, history, retainedSteps: history.past.length + history.future.length, droppedSteps: total - history.past.length - history.future.length }
}

/** Decode only bounded, acyclic references; no command functions are executed.
 * Current source is borrowed, historical nodes are new ordinary JSON objects.
 * Safe property definition preserves names such as __proto__ without prototype
 * mutation. Old keys, easing and authoring writers remain exact. Validation
 * rejects an entire corrupt graph before it is adopted by the editor.
 */
export function decodeHistory(present: ChronoScene, input: unknown): HistoryState {
  measureJson(input, { maxBytes: HISTORY_GRAPH_BYTES, maxChars: HISTORY_GRAPH_BYTES, maxNodes: 1000000 })
  const graph = input as HistoryGraph
  if (!graph || graph.version !== 1 || !Array.isArray(graph.nodes) || graph.nodes.length > 100000
    || !Array.isArray(graph.past) || !Array.isArray(graph.future) || graph.past.length + graph.future.length > 50) throw new Error('Unsupported history graph.')
  if (graph.strings && (!Array.isArray(graph.strings) || graph.strings.length > 100000 || graph.strings.some(item => typeof item !== 'string'))) throw new Error('Invalid history strings.')
  const base: object[] = [], strings: string[] = [], built = new Map<number, object>(), active = new Set<number>()
  baseObjects(present, base, undefined, 0, new Set(), strings)
  const decode = (atom: Atom, depth = 0): unknown => {
    if (depth > 48) throw new Error('History reference depth exceeded.')
    if (!Array.isArray(atom)) {
      if (atom === null || ['number', 'boolean', 'string'].includes(typeof atom)) return atom
      throw new Error('Invalid history value.')
    }
    const [kind, index] = atom
    if (atom.length !== 2 || !Number.isSafeInteger(index) || index < 0 || ![0, 1, 2, 3].includes(kind)) throw new Error('Invalid history reference.')
    if (kind === 0) { if (index >= base.length) throw new Error('Missing history base reference.'); return base[index] }
    if (kind === 2) { if (index >= strings.length) throw new Error('Missing history base string.'); return strings[index] }
    if (kind === 3) { if (!graph.strings || index >= graph.strings.length) throw new Error('Missing history string.'); return graph.strings[index] }
    if (index >= graph.nodes.length || active.has(index)) throw new Error('Cyclic or missing history node.')
    if (built.has(index)) return built.get(index)
    active.add(index)
    const node = graph.nodes[index], value: Record<string, unknown> | unknown[] = 'array' in node ? [] : {}
    built.set(index, value)
    if ('array' in node && Array.isArray(node.array)) for (const item of node.array) (value as unknown[]).push(decode(item, depth + 1))
    else if ('object' in node && Array.isArray(node.object)) {
      const keys = new Set<string>()
      for (const pair of node.object) {
        if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || keys.has(pair[0])) throw new Error('Invalid history object entry.')
        keys.add(pair[0]); Object.defineProperty(value, pair[0], { value: decode(pair[1], depth + 1), enumerable: true, configurable: true, writable: true })
      }
    } else throw new Error('Invalid history node.')
    active.delete(index); return value
  }
  const scene = (atom: Atom): ChronoScene => {
    const result = decode(atom) as ChronoScene
    // Reuse structural source recognition/authoring validation without cloning
    // every shared snapshot through another JSON parse.
    if (!isChoronoScene(result, true)) throw new Error('Invalid historical scene.')
    result.layers.forEach(assertNumericInputExpressions)
    assertAuthoringData(result.authoring); assertSceneGuides(result.editorGuides)
    return result
  }
  return limitHistory({ present, past: graph.past.map(scene), future: graph.future.map(scene) }).history
}
